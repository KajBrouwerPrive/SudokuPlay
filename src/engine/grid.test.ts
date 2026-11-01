import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE } from "./__fixtures__/puzzles";
import {
  ALL_UNITS,
  BOXES,
  CELL_COUNT,
  PEERS,
  UNITS_OF_CELL,
  UnitKind,
  boxOf,
  cellAt,
  columnOf,
  countFilled,
  formatGrid,
  parseGrid,
  rowOf,
} from "./grid";

describe("cell coordinates", () => {
  it("maps cells to row, column and box", () => {
    expect([rowOf(0), columnOf(0), boxOf(0)]).toEqual([0, 0, 0]);
    expect([rowOf(40), columnOf(40), boxOf(40)]).toEqual([4, 4, 4]);
    expect([rowOf(80), columnOf(80), boxOf(80)]).toEqual([8, 8, 8]);
    expect([rowOf(23), columnOf(23), boxOf(23)]).toEqual([2, 5, 1]);
  });

  it("round-trips through cellAt", () => {
    for (let cell = 0; cell < CELL_COUNT; cell++) expect(cellAt(rowOf(cell), columnOf(cell))).toBe(cell);
  });
});

describe("units and peers", () => {
  it("has 27 units of 9 distinct cells, each cell in exactly 3", () => {
    expect(ALL_UNITS).toHaveLength(27);
    for (const unit of ALL_UNITS) expect(new Set(unit.cells).size).toBe(9);
    const membership = new Array<number>(CELL_COUNT).fill(0);
    for (const unit of ALL_UNITS) for (const cell of unit.cells) membership[cell]++;
    expect(membership.every((count) => count === 3)).toBe(true);
  });

  it("lists the top-right box cells", () => {
    expect(BOXES[2].cells).toEqual([6, 7, 8, 15, 16, 17, 24, 25, 26]);
  });

  it("gives each cell its row, column and box", () => {
    expect(UNITS_OF_CELL[23].map((unit) => [unit.kind, unit.index])).toEqual([
      [UnitKind.Row, 2],
      [UnitKind.Column, 5],
      [UnitKind.Box, 1],
    ]);
  });

  it("gives every cell 20 peers, never itself, and peers are symmetric", () => {
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      expect(PEERS[cell]).toHaveLength(20);
      expect(PEERS[cell]).not.toContain(cell);
      for (const peer of PEERS[cell]) expect(PEERS[peer]).toContain(cell);
    }
  });
});

describe("parseGrid / formatGrid", () => {
  it("round-trips a puzzle", () => {
    expect(formatGrid(parseGrid(CLASSIC_PUZZLE))).toBe(CLASSIC_PUZZLE);
  });

  it("accepts 0 for empty cells and ignores whitespace", () => {
    const withZeros = CLASSIC_PUZZLE.replace(/\./g, "0");
    const multiline = withZeros.match(/.{9}/g)!.join("\n");
    expect(formatGrid(parseGrid(multiline))).toBe(CLASSIC_PUZZLE);
  });

  it("counts the givens", () => {
    expect(countFilled(parseGrid(CLASSIC_PUZZLE))).toBe(30);
  });

  it("rejects the wrong length", () => {
    expect(() => parseGrid("123")).toThrow(/81 cells, got 3/);
  });

  it("rejects unknown characters", () => {
    expect(() => parseGrid("x" + ".".repeat(80))).toThrow(/Invalid character "x" at cell 0/);
  });
});
