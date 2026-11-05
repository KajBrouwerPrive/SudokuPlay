import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION } from "./__fixtures__/puzzles";
import {
  ALL_CANDIDATES,
  NO_CANDIDATES,
  candidateDigits,
  candidatesFor,
  computeAllCandidates,
  countAllCandidates,
  countCandidates,
  digitBit,
  hasCandidate,
} from "./candidates";
import { createEmptyGrid, parseGrid } from "./grid";

describe("candidate masks", () => {
  it("maps digits to bits", () => {
    expect(digitBit(1)).toBe(0b1);
    expect(digitBit(9)).toBe(0b1_0000_0000);
  });

  it("counts and lists digits", () => {
    const mask = digitBit(2) | digitBit(5) | digitBit(9);
    expect(countCandidates(mask)).toBe(3);
    expect(candidateDigits(mask)).toEqual([2, 5, 9]);
    expect(hasCandidate(mask, 5)).toBe(true);
    expect(hasCandidate(mask, 4)).toBe(false);
    expect(countCandidates(ALL_CANDIDATES)).toBe(9);
  });
});

describe("candidatesFor", () => {
  it("allows every digit on an empty grid", () => {
    expect(candidatesFor(createEmptyGrid(), 40)).toBe(ALL_CANDIDATES);
  });

  it("has none for a filled cell", () => {
    expect(candidatesFor(parseGrid(CLASSIC_PUZZLE), 0)).toBe(NO_CANDIDATES);
  });

  it("removes digits seen in the row, column and box", () => {
    // Cell 2 (row 0, column 2): row has 5,3,7; column has 8; box has 5,3,6,9,8.
    expect(candidateDigits(candidatesFor(parseGrid(CLASSIC_PUZZLE), 2))).toEqual([1, 2, 4]);
  });

  it("computes all cells at once", () => {
    const grid = parseGrid(CLASSIC_PUZZLE);
    const all = computeAllCandidates(grid);
    for (let cell = 0; cell < all.length; cell++) expect(all[cell]).toBe(candidatesFor(grid, cell));
  });
});

describe("countAllCandidates", () => {
  it("counts every candidate of every empty cell, and nothing for filled cells", () => {
    expect(countAllCandidates(createEmptyGrid())).toBe(81 * 9);
    expect(countAllCandidates(parseGrid(CLASSIC_SOLUTION))).toBe(0);
    const grid = parseGrid(CLASSIC_PUZZLE);
    const all = computeAllCandidates(grid);
    const expected = [...grid.keys()].filter((cell) => grid[cell] === 0).reduce((sum, cell) => sum + countCandidates(all[cell]), 0);
    expect(countAllCandidates(grid)).toBe(expected);
  });
});
