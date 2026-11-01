import { describe, expect, it } from "vitest";
import { EFFECTS, Effect, durationFor } from "./effects";

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
