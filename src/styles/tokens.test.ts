/// <reference types="node" />
// Reads the stylesheet from disk: Vitest strips plain CSS imports, even with ?raw.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** WCAG AA for normal text. */
const MIN_TEXT_CONTRAST = 4.5;

/** Text colour on background colour, for every pair that shows digits or labels. */
const TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["--text", "--bg"],
  ["--text", "--surface"],
  ["--muted", "--bg"],
  ["--muted", "--tile"],
  ["--muted", "--peer"],
  ["--given", "--tile"],
  ["--given", "--peer"],
  ["--given", "--same-digit"],
  ["--entered", "--tile"],
  ["--entered", "--peer"],
  ["--entered", "--same-digit"],
  ["--conflict", "--conflict-bg"],
  ["--accent-contrast", "--accent"],
  ["--text", "--key"],
  ["--muted", "--key"],
  ["--muted", "--key-done"],
];

type Theme = Map<string, string>;

function readTheme(block: string): Theme {
  return new Map([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

/** Light tokens come from the first :root; dark ones override them. */
function themes(): { light: Theme; dark: Theme } {
  const darkStart = tokensCss.indexOf("@media (prefers-color-scheme: dark)");
  const light = readTheme(tokensCss.slice(0, darkStart));
  const dark = new Map([...light, ...readTheme(tokensCss.slice(darkStart))]);
  return { light, dark };
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Expected a #rrggbb colour, got ${hex}`);
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("design tokens", () => {
  it("computes contrast like WCAG", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  const { light, dark } = themes();
  describe.each([
    ["light", light],
    ["dark", dark],
  ] as const)("%s theme", (_, theme) => {
    it.each(TEXT_PAIRS)("%s on %s is readable", (foreground, background) => {
      const ratio = contrast(theme.get(foreground) ?? "", theme.get(background) ?? "");
      expect(ratio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    });
  });
});
