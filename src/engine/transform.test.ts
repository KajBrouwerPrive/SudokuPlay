import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION } from "./__fixtures__/puzzles";
import { DIFFICULTIES, gradePuzzle } from "./grader";
import { BOX_SIZE, formatGrid, parseGrid } from "./grid";
import { PUZZLE_BANK } from "./puzzleBank.generated";
import { createRandom } from "./random";
import { hasUniqueSolution } from "./solver";
import { IDENTITY_TRANSFORM, applyTransform, randomTransform } from "./transform";
import { isSolved } from "./validator";

describe("transforms", () => {
  it("leaves a grid unchanged with the identity", () => {
    expect(formatGrid(applyTransform(parseGrid(CLASSIC_PUZZLE), IDENTITY_TRANSFORM))).toBe(CLASSIC_PUZZLE);
  });

  it("transposes", () => {
    const transposed = applyTransform(parseGrid(CLASSIC_SOLUTION), { ...IDENTITY_TRANSFORM, transpose: true });
    // The first row of the transposed grid is the first column of the original.
    expect(formatGrid(transposed).slice(0, 9)).toBe(firstColumn(CLASSIC_SOLUTION));
  });

  it("moves whole bands: the three lines of each target band come from one source band", () => {
    const sameSourceBand = (order: readonly number[]) =>
      [0, 1, 2].every((band) => new Set(order.slice(band * BOX_SIZE, (band + 1) * BOX_SIZE).map((line) => Math.floor(line / BOX_SIZE))).size === 1);
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { rowOrder, columnOrder } = randomTransform(createRandom(seed));
        return sameSourceBand(rowOrder) && sameSourceBand(columnOrder) && new Set(rowOrder).size === 9 && new Set(columnOrder).size === 9;
      }),
    );
  });

  it("turns a solution into another valid solution", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => isSolved(applyTransform(parseGrid(CLASSIC_SOLUTION), randomTransform(createRandom(seed))))),
      { numRuns: 200 },
    );
  });

  it("keeps uniqueness and difficulty for bank puzzles", () => {
    fc.assert(
      fc.property(fc.constantFrom(...DIFFICULTIES), fc.nat(), fc.integer(), (difficulty, pick, seed) => {
        const bank = PUZZLE_BANK[difficulty];
        const transformed = applyTransform(parseGrid(bank[pick % bank.length]), randomTransform(createRandom(seed)));
        const grade = gradePuzzle(transformed);
        return hasUniqueSolution(transformed) && grade.solvedLogically && grade.difficulty === difficulty;
      }),
      { numRuns: 100 },
    );
  });
});

function firstColumn(text: string): string {
  return Array.from({ length: 9 }, (_, row) => text[row * 9]).join("");
}
