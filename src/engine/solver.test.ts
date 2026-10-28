import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CLASSIC_PUZZLE,
  CLASSIC_SOLUTION,
  EMPTY_PUZZLE,
  INKALA_PUZZLE,
  INVALID_PUZZLE,
  SEVENTEEN_CLUE_PUZZLE,
  UNSOLVABLE_PUZZLE,
} from "./__fixtures__/puzzles";
import { CELL_COUNT, EMPTY, GRID_SIZE, boxOf, cellAt, formatGrid, parseGrid, type Grid } from "./grid";
import { createRandom, type Random } from "./random";
import { SolveStatus, countSolutions, hasUniqueSolution, solve } from "./solver";
import { isSolved, respectsGivens } from "./validator";

/** Hard puzzles must stay well under this, or generating them later will feel slow. */
const HARD_PUZZLE_BUDGET_MS = 500;

function expectSolutionOf(puzzle: Grid, random?: Random): Grid {
  const result = solve(puzzle, { random });
  if (result.status !== SolveStatus.Solved) throw new Error(`Expected a solution, got ${result.status}`);
  expect(isSolved(result.solution)).toBe(true);
  expect(respectsGivens(puzzle, result.solution)).toBe(true);
  return result.solution;
}

describe("solve", () => {
  it("solves the classic puzzle to its known solution", () => {
    expect(formatGrid(expectSolutionOf(parseGrid(CLASSIC_PUZZLE)))).toBe(CLASSIC_SOLUTION);
  });

  it.each([
    ["Inkala", INKALA_PUZZLE],
    ["17 givens", SEVENTEEN_CLUE_PUZZLE],
  ])("solves the %s puzzle within budget", (_, text) => {
    const startedAt = performance.now();
    expectSolutionOf(parseGrid(text));
    expect(performance.now() - startedAt).toBeLessThan(HARD_PUZZLE_BUDGET_MS);
  });

  it("returns a solved grid unchanged", () => {
    expect(formatGrid(expectSolutionOf(parseGrid(CLASSIC_SOLUTION)))).toBe(CLASSIC_SOLUTION);
  });

  it("fills an empty grid", () => {
    expectSolutionOf(parseGrid(EMPTY_PUZZLE));
  });

  it("fills an empty grid differently per seed, and the same for the same seed", () => {
    const fill = (seed: number) => formatGrid(expectSolutionOf(parseGrid(EMPTY_PUZZLE), createRandom(seed)));
    expect(fill(1)).toBe(fill(1));
    expect(fill(1)).not.toBe(fill(2));
  });

  it("does not modify its input", () => {
    const puzzle = parseGrid(CLASSIC_PUZZLE);
    solve(puzzle);
    expect(formatGrid(puzzle)).toBe(CLASSIC_PUZZLE);
  });

  it("reports unsolvable and invalid grids", () => {
    expect(solve(parseGrid(UNSOLVABLE_PUZZLE)).status).toBe(SolveStatus.Unsolvable);
    expect(solve(parseGrid(INVALID_PUZZLE)).status).toBe(SolveStatus.Invalid);
  });
});

describe("countSolutions", () => {
  it.each([
    ["classic", CLASSIC_PUZZLE],
    ["Inkala", INKALA_PUZZLE],
    ["17 givens", SEVENTEEN_CLUE_PUZZLE],
  ])("finds exactly one solution for the %s puzzle", (_, text) => {
    expect(hasUniqueSolution(parseGrid(text))).toBe(true);
  });

  it("stops at the limit for an open grid", () => {
    expect(countSolutions(parseGrid(EMPTY_PUZZLE))).toBe(2);
    expect(countSolutions(parseGrid(EMPTY_PUZZLE), 5)).toBe(5);
    expect(hasUniqueSolution(parseGrid(EMPTY_PUZZLE))).toBe(false);
  });

  it("finds two when two digits can swap", () => {
    // Clearing a 2x2 rectangle with digits a/b in two rows, two columns and two boxes leaves both orders open.
    const solution = parseGrid(CLASSIC_SOLUTION);
    const rectangle = findSwappableRectangle(solution);
    expect(rectangle).not.toBeNull();
    const puzzle = parseGrid(CLASSIC_SOLUTION);
    for (const cell of rectangle!) puzzle[cell] = EMPTY;
    expect(countSolutions(puzzle)).toBe(2);
  });

  it("returns 0 for unsolvable and invalid grids", () => {
    expect(countSolutions(parseGrid(UNSOLVABLE_PUZZLE))).toBe(0);
    expect(countSolutions(parseGrid(INVALID_PUZZLE))).toBe(0);
  });

  it("rejects a limit below 1", () => {
    expect(() => countSolutions(parseGrid(CLASSIC_PUZZLE), 0)).toThrow(RangeError);
  });
});

/** Four cells in two rows, two columns and exactly two boxes holding a,b / b,a: a "deadly pattern". */
function findSwappableRectangle(grid: Grid): number[] | null {
  for (let top = 0; top < GRID_SIZE; top++)
    for (let bottom = top + 1; bottom < GRID_SIZE; bottom++)
      for (let left = 0; left < GRID_SIZE; left++)
        for (let right = left + 1; right < GRID_SIZE; right++) {
          const cells = [cellAt(top, left), cellAt(top, right), cellAt(bottom, left), cellAt(bottom, right)];
          const [a, b, c, d] = cells.map((cell) => grid[cell]);
          const boxes = new Set(cells.map(boxOf));
          if (a === d && b === c && a !== b && boxes.size === 2) return cells;
        }
  return null;
}

describe("properties", () => {
  const solution = parseGrid(CLASSIC_SOLUTION);
  const cellSubset = fc.uniqueArray(fc.integer({ min: 0, max: CELL_COUNT - 1 }), { maxLength: CELL_COUNT });
  const digitPermutation = fc.shuffledSubarray([1, 2, 3, 4, 5, 6, 7, 8, 9], { minLength: 9, maxLength: 9 });

  it("solves any puzzle made by clearing cells of a valid solution, keeping the givens", () => {
    fc.assert(
      fc.property(cellSubset, (cleared) => {
        const puzzle = parseGrid(CLASSIC_SOLUTION);
        for (const cell of cleared) puzzle[cell] = EMPTY;
        const result = solve(puzzle);
        return result.status === SolveStatus.Solved && isSolved(result.solution) && respectsGivens(puzzle, result.solution);
      }),
      { numRuns: 200 },
    );
  });

  it("keeps uniqueness when digits are relabelled", () => {
    fc.assert(
      fc.property(digitPermutation, (permutation) => {
        const puzzle = parseGrid(CLASSIC_PUZZLE).map((value) => (value === EMPTY ? EMPTY : permutation[value - 1]));
        const result = solve(puzzle);
        if (result.status !== SolveStatus.Solved) return false;
        const expected = solution.map((value) => permutation[value - 1]);
        return hasUniqueSolution(puzzle) && formatGrid(result.solution) === formatGrid(expected);
      }),
      { numRuns: 50 },
    );
  });
});
