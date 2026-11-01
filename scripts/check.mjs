// Fast local check: lint, type check and the engine tests, run in parallel. Prints one line on
// success and only the failing steps' output on failure. The suite is small, so it always runs whole.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line no-control-regex -- ANSI colour codes start with the ESC control character.
const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;
const node = (script, ...args) => ({ command: process.execPath, args: [script, ...args] });

const STEPS = [
  { name: "lint", ...node("node_modules/eslint/bin/eslint.js", ".") },
  { name: "typecheck", ...node("node_modules/typescript/bin/tsc", "-p", "tsconfig.app.json") },
  { name: "typecheck-config", ...node("node_modules/typescript/bin/tsc", "-p", "tsconfig.node.json") },
  {
    name: "tests",
    ...node("node_modules/vitest/vitest.mjs", "run"),
    summarize: (output) => output.match(/Tests\s+(\d+) passed/)?.[1]?.concat(" tests") ?? "",
  },
];

function runStep(root, step) {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolve({ name: step.name, ok: false, detail: "", output: String(error) }));
    child.on("close", (code) => {
      const clean = output.replace(ANSI_PATTERN, "");
      resolve({ name: step.name, ok: code === 0, detail: code === 0 ? (step.summarize?.(clean) ?? "") : "", output: clean });
    });
  });
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const startedAt = Date.now();
  const results = await Promise.all(STEPS.map((step) => runStep(root, step)));
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    const parts = results.map((result) => (result.detail ? `${result.name} ${result.detail}` : result.name));
    console.log(`check ok: ${parts.join(", ")} (${seconds}s)`);
    return;
  }
  for (const result of failed) console.log(`--- ${result.name} failed ---\n${result.output.trim()}\n`);
  console.log(`check FAILED: ${failed.map((result) => result.name).join(", ")} (${seconds}s)`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`check FAILED: ${error.message}`);
  process.exitCode = 1;
});
