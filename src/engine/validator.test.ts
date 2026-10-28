import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION } from "./__fixtures__/puzzles";
import { UnitKind, cloneGrid, parseGrid } from "./grid";
import {
  conflictingPeers,
  findConflictingCells,
  findConflicts,
  isComplete,
  isSolved,
  isValidPlacement,
  respectsGivens,
} from "./validator";

describe("placement checks", () => {
  const puzzle = parseGrid(CLASSIC_PUZZLE);

  it("accepts a digit no peer holds", () => {
    expect(isValidPlacement(puzzle, 2, 4)).toBe(true);
    expect(conflictingPeers(puzzle, 2, 4)).toEqual([]);
  });

  it("names every peer that already holds the digit", () => {
    // Cell 2 with a 5: the 5 in cell 0 shares row and box. With an 8: the 8 in cell 20 shares box and column.
    expect(conflictingPeers(puzzle, 2, 5)).toEqual([0]);
    expect(conflictingPeers(puzzle, 2, 8)).toEqual([20]);
    expect(isValidPlacement(puzzle, 2, 8)).toBe(false);
  });
});

describe("findConflicts", () => {
  it("finds none in a valid puzzle or solution", () => {
    expect(findConflicts(parseGrid(CLASSIC_PUZZLE))).toEqual([]);
    expect(findConflicts(parseGrid(CLASSIC_SOLUTION))).toEqual([]);
  });

  it("reports a duplicate once per unit it breaks", () => {
    const grid = parseGrid(CLASSIC_PUZZLE);
    grid[1] = 5; // Row 0 and box 0 now both hold two 5s (cells 0 and 1).
    const conflicts = findConflicts(grid);
    expect(conflicts.map((conflict) => [conflict.unit.kind, conflict.unit.index, conflict.digit, conflict.cells])).toEqual([
      [UnitKind.Row, 0, 5, [0, 1]],
      [UnitKind.Box, 0, 5, [0, 1]],
    ]);
    expect(findConflictingCells(grid)).toEqual([0, 1]);
  });
});

describe("completion", () => {
  it("is not complete while cells are empty", () => {
    const puzzle = parseGrid(CLASSIC_PUZZLE);
    expect(isComplete(puzzle)).toBe(false);
    expect(isSolved(puzzle)).toBe(false);
  });

  it("is solved when full and conflict-free", () => {
    expect(isSolved(parseGrid(CLASSIC_SOLUTION))).toBe(true);
  });

  it("is complete but not solved when full with a duplicate", () => {
    const grid = cloneGrid(parseGrid(CLASSIC_SOLUTION));
    [grid[0], grid[1]] = [grid[1], grid[0]];
    expect(isComplete(grid)).toBe(true);
    expect(isSolved(grid)).toBe(false);
  });

  it("checks that a solution keeps the givens", () => {
    const puzzle = parseGrid(CLASSIC_PUZZLE);
    const solution = parseGrid(CLASSIC_SOLUTION);
    expect(respectsGivens(puzzle, solution)).toBe(true);
    solution[0] = 1;
    expect(respectsGivens(puzzle, solution)).toBe(false);
  });
});
