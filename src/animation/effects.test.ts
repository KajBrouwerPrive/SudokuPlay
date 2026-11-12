import { describe, expect, it } from "vitest";
import { EFFECTS, Effect, EffectPart, durationFor, resolveTokens } from "./effects";

/** Properties that move or resize something; reduced motion must not use them. */
const MOTION_PROPERTIES = ["transform", "translate", "rotate", "scale", "left", "top", "width", "height"];
/** Properties that are cheap to animate (compositor or paint only). */
const ALLOWED_PROPERTIES = new Set(["transform", "opacity", "boxShadow", "offset", "easing"]);

const allEffects = Object.values(Effect);

describe("effect specs", () => {
  it("has a spec for every effect", () => {
    for (const effect of allEffects) expect(EFFECTS[effect]).toBeDefined();
  });

  it.each(allEffects)("%s only animates cheap properties, with at least two keyframes", (effect) => {
    const { keyframes, reducedKeyframes } = EFFECTS[effect];
    expect(keyframes.length).toBeGreaterThanOrEqual(2);
    for (const frame of [...keyframes, ...(reducedKeyframes ?? [])]) {
      for (const property of Object.keys(frame)) expect(ALLOWED_PROPERTIES.has(property)).toBe(true);
    }
  });

  it.each(allEffects)("%s has no movement in reduced motion", (effect) => {
    for (const frame of EFFECTS[effect].reducedKeyframes ?? []) {
      for (const property of MOTION_PROPERTIES) expect(frame).not.toHaveProperty(property);
    }
  });

  it("keeps reduced effects short", () => {
    for (const effect of allEffects) expect(durationFor(effect, true)).toBeLessThanOrEqual(durationFor(effect, false));
  });
});

describe("digit visibility", () => {
  const valueEffects = allEffects.filter((effect) => EFFECTS[effect].part === EffectPart.Value);

  // A digit on a same-digit tile must never stay hidden: an effect that starts at opacity 0
  // names its end opacity explicitly instead of relying on the underlying style.
  it.each(valueEffects)("%s that starts hidden ends fully visible", (effect) => {
    for (const frames of [EFFECTS[effect].keyframes, EFFECTS[effect].reducedKeyframes ?? []]) {
      const opacities = frames.map((frame) => frame.opacity);
      if (opacities.length > 0 && Number(opacities[0]) === 0) expect(Number(opacities[opacities.length - 1])).toBe(1);
    }
  });
});

describe("resolveTokens", () => {
  it("fills in design tokens and leaves the rest alone", () => {
    const tokens: Record<string, string> = { "--fx-wave": " gold " };
    const resolved = resolveTokens(
      [{ boxShadow: "inset 0 0 0 999px var(--fx-wave)", offset: 0.5 }, { boxShadow: "var(--unknown)", opacity: 1 }],
      (token) => tokens[token] ?? "",
    );
    expect(resolved).toEqual([{ boxShadow: "inset 0 0 0 999px gold", offset: 0.5 }, { boxShadow: "var(--unknown)", opacity: 1 }]);
  });

  it("finds a value for every token the effects use", () => {
    const used = new Set(
      Object.values(EFFECTS).flatMap(({ keyframes, reducedKeyframes }) =>
        [...keyframes, ...(reducedKeyframes ?? [])].flatMap((frame) => [...JSON.stringify(frame).matchAll(/var\((--[\w-]+)\)/g)].map(([, token]) => token)),
      ),
    );
    expect([...used].sort()).toEqual(["--fx-conflict", "--fx-mistake", "--fx-sweep", "--fx-wave"]);
  });
});
