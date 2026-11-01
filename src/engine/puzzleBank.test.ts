import { describe, expect, it } from "vitest";
import { DIFFICULTIES, Difficulty, gradePuzzle } from "./grader";
import { formatGrid } from "./grid";
import { createPuzzle } from "./puzzleBank";
import { PUZZLE_BANK } from "./puzzleBank.generated";
import { hasUniqueSolution } from "./solver";
import { isSolved, respectsGivens } from "./validator";

/** createPuzzle runs when a player taps "new game"; it must feel instant even on a phone. */
const CREATE_BUDGET_MS = 50;

describe("createPuzzle", () => {
  it("has puzzles for every level", () => {
    for (const difficulty of DIFFICULTIES) expect(PUZZLE_BANK[difficulty].length).toBeGreaterThan(0);
  });

  it.each(DIFFICULTIES)("creates a valid %s puzzle at that level, fast", (difficulty) => {
    const startedAt = performance.now();
    const created = createPuzzle({ difficulty, seed: 123 });
    expect(performance.now() - startedAt).toBeLessThan(CREATE_BUDGET_MS);
    expect(isSolved(created.solution)).toBe(true);
    expect(respectsGivens(created.puzzle, created.solution)).toBe(true);
    expect(hasUniqueSolution(created.puzzle)).toBe(true);
    expect(gradePuzzle(created.puzzle)).toMatchObject({ solvedLogically: true, difficulty });
  });

  it("is deterministic per seed and varies between seeds", () => {
    const puzzleFor = (seed: number) => formatGrid(createPuzzle({ difficulty: Difficulty.Hard, seed }).puzzle);
    expect(puzzleFor(5)).toBe(puzzleFor(5));
    const distinct = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(puzzleFor));
    expect(distinct.size).toBe(8);
  });
});
