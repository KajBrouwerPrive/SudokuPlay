// Shared baseline (Pro-Solutio/control, block file:audit-diff; CNT-177). The one comparison behind two CI
// steps: "npm audit, new high and critical advisories only" (block workflow:ci-security-steps) and "Edge
// Functions, new high and critical advisories in deno.lock only" (block workflow:ci-edge-functions). Both
// look at the PR head and the PR base and fail only on high or critical advisories that are new in the
// head, so advisories already on main do not block every PR. Node built-ins only, no dependencies.
//
//   node .github/scripts/audit-diff.mjs npm-audit <base npm audit --json> <head npm audit --json> <label>
//   node .github/scripts/audit-diff.mjs deno-lock <base deno.lock, or - when the base has none> <head deno.lock> <label>
//
// deno-lock sends the npm: packages of each deno.lock to npm's bulk advisory endpoint, the endpoint that
// npm audit and deno audit use. jsr: packages and remote (https:) imports are not covered: no advisory
// database serves them.
//
// Exit code: 0 nothing new, 1 new high or critical advisories (each printed as an ::error), 2 the scan
// could not run (no report, an endpoint that cannot be reached or an answer of an unexpected shape). Never
// green without a complete comparison.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERIOUS_SEVERITIES = Object.freeze(["high", "critical"]);
export const BULK_ADVISORY_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
export const MODES = Object.freeze({ NPM_AUDIT: "npm-audit", DENO_LOCK: "deno-lock" });
export const EXIT_CODES = Object.freeze({ CLEAN: 0, NEW_ADVISORIES: 1, SCAN_FAILED: 2 });
/** The base argument of deno-lock when the PR base has no deno.lock for this function. */
export const NO_BASE = "-";
const TOOL_TITLES = Object.freeze({ [MODES.NPM_AUDIT]: "npm audit", [MODES.DENO_LOCK]: "deno.lock audit" });
const REQUEST_TIMEOUT_MS = 30_000;

/** A scan that cannot give a complete comparison: exit 2, never green. */
export class AuditError extends Error {}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isSerious = (severity) => SERIOUS_SEVERITIES.includes(severity);

/**
 * The high and critical advisories of an `npm audit --json` report, keyed by package and advisory id.
 * @param {unknown} report
 * @param {string} where "at the PR base" or "at the PR head", for the message
 * @param {{ requireReport?: boolean }} [options] the head must have a report; the base is `{}` when it had no
 *   package-lock.json, which counts as no advisories
 * @returns {Map<string, string>} key → line for the log
 */
export function seriousFromNpmAudit(report, where, { requireReport = true } = {}) {
  if (!isObject(report)) throw new AuditError(`npm audit gave no report ${where}`);
  if (report.error) throw new AuditError(`npm audit failed ${where}: ${JSON.stringify(report.error)}`);
  if (requireReport && !isObject(report.vulnerabilities)) throw new AuditError(`npm audit gave no report ${where}: ${JSON.stringify(report)}`);
  const found = new Map();
  for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of entry?.via ?? []) {
      if (isObject(via) && isSerious(via.severity)) found.set(`${name} ${via.source}`, `${via.severity}: ${name} ${via.range}, ${via.title} (${via.url})`);
    }
  }
  return found;
}

/**
 * Name and version of a key in the `npm` section of deno.lock: `name@version`, `@scope/name@version`, with an
 * optional peer suffix after `_` (`name@1.0.0_peer@2.0.0`).
 * @param {string} key
 */
export function parseDenoNpmKey(key) {
  const at = key.indexOf("@", 1);
  if (at <= 0) throw new AuditError(`deno.lock has an npm entry without a version: ${JSON.stringify(key)}`);
  const version = key.slice(at + 1).split("_")[0];
  if (!version) throw new AuditError(`deno.lock has an npm entry without a version: ${JSON.stringify(key)}`);
  return { name: key.slice(0, at), version };
}

/**
 * The npm packages of a deno.lock, name → versions. A lockfile without an `npm` section has none (only jsr:
 * packages or remote imports).
 * @param {unknown} lock the parsed deno.lock
 * @returns {Record<string, string[]>}
 */
export function npmPackagesFromDenoLock(lock) {
  if (!isObject(lock)) throw new AuditError("deno.lock is not a JSON object");
  if (lock.npm === undefined) return {};
  if (!isObject(lock.npm)) throw new AuditError("deno.lock has an npm section that is not an object");
  const packages = {};
  for (const key of Object.keys(lock.npm)) {
    const { name, version } = parseDenoNpmKey(key);
    packages[name] = [...new Set([...(packages[name] ?? []), version])].sort();
  }
  return packages;
}

/**
 * Asks npm's bulk advisory endpoint for the advisories of these packages. No packages, no request.
 * @param {Record<string, string[]>} packages
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<Record<string, unknown>>}
 */
export async function bulkAdvisories(packages, fetchImpl = fetch) {
  if (Object.keys(packages).length === 0) return {};
  let response;
  try {
    response = await fetchImpl(BULK_ADVISORY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(packages),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AuditError(`the npm bulk advisory endpoint is not reachable (${error instanceof Error ? error.name : "error"})`);
  }
  if (!response.ok) throw new AuditError(`the npm bulk advisory endpoint answered ${response.status}`);
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new AuditError("the npm bulk advisory endpoint did not answer JSON");
  }
  if (!isObject(body)) throw new AuditError("the npm bulk advisory endpoint did not answer an object");
  return body;
}

/**
 * The high and critical advisories of a bulk answer, keyed by package and advisory id: the same keys and lines
 * as `seriousFromNpmAudit`, whose `via.source` is that id.
 * @param {Record<string, unknown>} answer
 * @returns {Map<string, string>}
 */
export function seriousFromBulk(answer) {
  const found = new Map();
  for (const [name, advisories] of Object.entries(answer)) {
    if (!Array.isArray(advisories)) throw new AuditError(`the npm bulk advisory endpoint gave no list for ${name}`);
    for (const advisory of advisories) {
      if (!isObject(advisory) || advisory.id === undefined || typeof advisory.severity !== "string") throw new AuditError(`the npm bulk advisory endpoint gave an advisory of an unexpected shape for ${name}`);
      if (isSerious(advisory.severity)) found.set(`${name} ${advisory.id}`, `${advisory.severity}: ${name} ${advisory.vulnerable_versions}, ${advisory.title} (${advisory.url})`);
    }
  }
  return found;
}

/**
 * The advisories in `head` that are not in `base`.
 * @param {Map<string, string>} base @param {Map<string, string>} head
 * @returns {string[]} their lines
 */
export function newAdvisories(base, head) {
  return [...head].filter(([key]) => !base.has(key)).map(([, line]) => line);
}

/** @param {string} filePath @param {string} what */
function readJson(filePath, what) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new AuditError(`${what} cannot be read (${error?.code ?? "error"})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AuditError(`${what} is not JSON`);
  }
}

/**
 * The serious advisories at the PR base and head for one mode.
 * @param {{ mode: string, basePath: string, headPath: string, fetchImpl?: typeof fetch }} input
 */
export async function compareAudit({ mode, basePath, headPath, fetchImpl = fetch }) {
  if (mode === MODES.NPM_AUDIT) {
    // Read the head first: a head without a report is the more useful message.
    const head = seriousFromNpmAudit(readJson(headPath, "the npm audit report of the PR head"), "at the PR head");
    const base = seriousFromNpmAudit(readJson(basePath, "the npm audit report of the PR base"), "at the PR base", { requireReport: false });
    return newAdvisories(base, head);
  }
  if (mode === MODES.DENO_LOCK) {
    const head = seriousFromBulk(await bulkAdvisories(npmPackagesFromDenoLock(readJson(headPath, "deno.lock of the PR head")), fetchImpl));
    const base = basePath === NO_BASE ? new Map() : seriousFromBulk(await bulkAdvisories(npmPackagesFromDenoLock(readJson(basePath, "deno.lock of the PR base")), fetchImpl));
    return newAdvisories(base, head);
  }
  throw new AuditError(`unknown mode ${JSON.stringify(mode)}; use ${Object.values(MODES).join(" or ")}`);
}

/**
 * Runs one comparison and gives the lines to print and the exit code. Never throws.
 * @param {string[]} argv mode, base, head, label
 * @param {typeof fetch} [fetchImpl]
 */
export async function run(argv, fetchImpl = fetch) {
  const [mode, basePath, headPath, label] = argv;
  const title = `${TOOL_TITLES[mode] ?? "audit"} (${label ?? "?"})`;
  if (!basePath || !headPath || !label) return { exitCode: EXIT_CODES.SCAN_FAILED, lines: [`::error title=${title}::usage: audit-diff.mjs <${Object.values(MODES).join("|")}> <base> <head> <label>`] };
  try {
    const added = await compareAudit({ mode, basePath, headPath, fetchImpl });
    const lines = added.map((line) => `::error title=${title}::${line}`);
    lines.push(`${label}: ${added.length} new high or critical advisories`);
    return { exitCode: added.length > 0 ? EXIT_CODES.NEW_ADVISORIES : EXIT_CODES.CLEAN, lines };
  } catch (error) {
    if (!(error instanceof AuditError)) throw error;
    return { exitCode: EXIT_CODES.SCAN_FAILED, lines: [`::error title=${title}::${error.message}; the scan could not run, so this step fails`] };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then(
    ({ exitCode, lines }) => {
      for (const line of lines) console.log(line);
      process.exitCode = exitCode;
    },
    (error) => {
      console.log(`::error title=audit-diff::${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = EXIT_CODES.SCAN_FAILED;
    },
  );
}
