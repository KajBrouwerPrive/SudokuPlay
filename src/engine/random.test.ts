import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRandom, seedFromText } from "./random";

describe("createRandom", () => {
  it("repeats the same sequence for the same seed", () => {
    const first = createRandom(42);
    const second = createRandom(42);
    for (let index = 0; index < 100; index++) expect(first.next()).toBe(second.next());
  });

  it("gives different sequences for different seeds", () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next());
  });

  it("keeps floats in [0, 1) and integers in range", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 1000 }), (seed, max) => {
        const random = createRandom(seed);
        const value = random.next();
        const integer = random.nextInt(max);
        return value >= 0 && value < 1 && Number.isInteger(integer) && integer >= 0 && integer < max;
      }),
    );
  });

  it("rejects a non-positive range", () => {
    expect(() => createRandom(1).nextInt(0)).toThrow(RangeError);
  });

  it("shuffles into a permutation without touching the input", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const shuffled = createRandom(7).shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...shuffled].sort()).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });
});

describe("seedFromText", () => {
  it("is stable and spreads nearby texts", () => {
    expect(seedFromText("2026-10-28")).toBe(seedFromText("2026-10-28"));
    expect(seedFromText("2026-10-28")).not.toBe(seedFromText("2026-10-29"));
    expect(Number.isInteger(seedFromText(""))).toBe(true);
  });
});
