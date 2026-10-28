import { describe, expect, it } from "vitest";
import { Difficulty, gradePuzzle } from "./grader";
import { MIN_GIVENS, generatePuzzle } from "./generator";
import { countFilled, formatGrid } from "./grid";
import { hasUniqueSolution } from "./solver";
import { isSolved, respectsGivens } from "./validator";

const SEEDS = [1, 2, 3, 4, 5];

describe("generatePuzzle", () => {
  it.each([Difficulty.Easy, Difficulty.Medium])("makes valid %s puzzles at the requested level", (difficulty) => {
    for (const seed of SEEDS) {
      const generated = generatePuzzle({ difficulty, seed });
      expect(generated.difficulty).toBe(difficulty);
      expect(isSolved(generated.solution)).toBe(true);
      expect(respectsGivens(generated.puzzle, generated.solution)).toBe(true);
      expect(hasUniqueSolution(generated.puzzle)).toBe(true);
      expect(countFilled(generated.puzzle)).toBeGreaterThanOrEqual(MIN_GIVENS[difficulty]);
      expect(gradePuzzle(generated.puzzle)).toMatchObject({ solvedLogically: true, difficulty });
    }
  });

  it("is deterministic per seed", () => {
    const first = generatePuzzle({ difficulty: Difficulty.Easy, seed: 99 });
    const second = generatePuzzle({ difficulty: Difficulty.Easy, seed: 99 });
    const other = generatePuzzle({ difficulty: Difficulty.Easy, seed: 100 });
    expect(formatGrid(first.puzzle)).toBe(formatGrid(second.puzzle));
    expect(formatGrid(first.puzzle)).not.toBe(formatGrid(other.puzzle));
  });

  it("falls back to the hardest puzzle found when the target is out of reach", () => {
    // One attempt rarely reaches expert; the result must still be valid and say what it is.
    const generated = generatePuzzle({ difficulty: Difficulty.Expert, seed: 1, maxAttempts: 1 });
    expect(generated.attempts).toBe(1);
    expect(gradePuzzle(generated.puzzle)).toMatchObject({ solvedLogically: true, difficulty: generated.difficulty });
  });

  it("rejects fewer than one attempt", () => {
    expect(() => generatePuzzle({ difficulty: Difficulty.Easy, seed: 1, maxAttempts: 0 })).toThrow(RangeError);
  });
});
