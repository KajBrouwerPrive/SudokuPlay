import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION, INKALA_PUZZLE } from "./__fixtures__/puzzles";
import { DIFFICULTIES, Difficulty, TECHNIQUE_DIFFICULTY, difficultyRank, gradePuzzle } from "./grader";
import { parseGrid } from "./grid";
import { PUZZLE_BANK } from "./puzzleBank.generated";

describe("gradePuzzle", () => {
  it("grades the classic puzzle as easy", () => {
    const grade = gradePuzzle(parseGrid(CLASSIC_PUZZLE));
    expect(grade).toMatchObject({ solvedLogically: true, difficulty: Difficulty.Easy });
    expect(grade.steps).toHaveLength(51);
  });

  it("grades a solved grid as easy with no steps", () => {
    expect(gradePuzzle(parseGrid(CLASSIC_SOLUTION))).toEqual({ solvedLogically: true, difficulty: Difficulty.Easy, steps: [] });
  });

  it("gets stuck on Inkala's puzzle, which needs techniques beyond X-Wing", () => {
    const grade = gradePuzzle(parseGrid(INKALA_PUZZLE));
    expect(grade.solvedLogically).toBe(false);
  });

  it.each(DIFFICULTIES)("grades every %s bank puzzle at its level, with its level's technique as the hardest", (difficulty) => {
    for (const text of PUZZLE_BANK[difficulty]) {
      const grade = gradePuzzle(parseGrid(text));
      if (!grade.solvedLogically) throw new Error(`Bank puzzle ${text} is not logically solvable`);
      expect(grade.difficulty).toBe(difficulty);
      expect(grade.steps.some((step) => TECHNIQUE_DIFFICULTY[step.technique] === difficulty)).toBe(true);
    }
  });

  it("orders difficulties", () => {
    expect(DIFFICULTIES.map(difficultyRank)).toEqual([0, 1, 2, 3]);
  });
});
