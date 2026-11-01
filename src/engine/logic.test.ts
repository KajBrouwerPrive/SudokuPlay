import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION } from "./__fixtures__/puzzles";
import { ALL_CANDIDATES, digitBit } from "./candidates";
import { BOXES, CELL_COUNT, COLUMNS, ROWS, cellAt, createEmptyGrid, formatGrid, parseGrid, type Digit } from "./grid";
import {
  Technique,
  applyStep,
  createLogicState,
  findClaiming,
  findHiddenPair,
  findHiddenSingle,
  findHiddenTriple,
  findNakedPair,
  findNakedSingle,
  findNakedTriple,
  findNextStep,
  findPointing,
  findXWing,
  type LogicState,
} from "./logic";

/** An empty grid where every cell still allows every digit; tests carve patterns into it. */
function openState(): LogicState {
  return { grid: createEmptyGrid(), candidates: new Uint16Array(CELL_COUNT).fill(ALL_CANDIDATES) };
}

function removeCandidate(state: LogicState, cells: readonly number[], digit: Digit): void {
  for (const cell of cells) state.candidates[cell] &= ~digitBit(digit);
}

function onlyCandidates(state: LogicState, cell: number, digits: readonly Digit[]): void {
  state.candidates[cell] = digits.reduce((mask, digit) => mask | digitBit(digit), 0);
}

function without(cells: readonly number[], excluded: readonly number[]): number[] {
  return cells.filter((cell) => !excluded.includes(cell));
}

describe("singles", () => {
  it("finds a hidden single: the only place in a row for a digit", () => {
    const state = openState();
    removeCandidate(state, without(ROWS[0].cells, [3]), 5);
    expect(findHiddenSingle(state)).toMatchObject({ technique: Technique.HiddenSingle, placements: [{ cell: 3, digit: 5 }], units: [ROWS[0]] });
  });

  it("finds a naked single: a cell with one candidate", () => {
    const state = openState();
    onlyCandidates(state, 40, [7]);
    expect(findNakedSingle(state)).toMatchObject({ technique: Technique.NakedSingle, placements: [{ cell: 40, digit: 7 }] });
  });

  it("finds nothing on a wide-open grid", () => {
    const state = openState();
    expect(findHiddenSingle(state)).toBeNull();
    expect(findNakedSingle(state)).toBeNull();
  });
});

describe("locked candidates", () => {
  it("pointing: a digit confined to one row of a box leaves the rest of that row", () => {
    const state = openState();
    removeCandidate(state, without(BOXES[0].cells, [0, 1, 2]), 7);
    const step = findPointing(state);
    expect(step).toMatchObject({ technique: Technique.Pointing, patternCells: [0, 1, 2], digits: [7] });
    expect(step!.eliminations).toEqual([3, 4, 5, 6, 7, 8].map((cell) => ({ cell, digit: 7 })));
  });

  it("claiming: a digit confined to one box within a row leaves the rest of that box", () => {
    const state = openState();
    removeCandidate(state, without(ROWS[0].cells, [0, 1]), 7);
    const step = findClaiming(state);
    expect(step).toMatchObject({ technique: Technique.Claiming, patternCells: [0, 1], digits: [7] });
    expect(step!.eliminations).toEqual([9, 10, 11, 18, 19, 20].map((cell) => ({ cell, digit: 7 })));
  });
});

describe("subsets", () => {
  it("naked pair: two cells sharing the same two candidates clear them from the row", () => {
    const state = openState();
    onlyCandidates(state, 0, [1, 2]);
    onlyCandidates(state, 4, [1, 2]);
    const step = findNakedPair(state);
    expect(step).toMatchObject({ technique: Technique.NakedPair, patternCells: [0, 4], digits: [1, 2], units: [ROWS[0]] });
    expect(step!.eliminations).toHaveLength(7 * 2);
    expect(step!.eliminations).toContainEqual({ cell: 8, digit: 2 });
  });

  it("hidden pair: two digits that fit only in the same two cells clear everything else there", () => {
    const state = openState();
    removeCandidate(state, without(ROWS[0].cells, [0, 4]), 1);
    removeCandidate(state, without(ROWS[0].cells, [0, 4]), 2);
    const step = findHiddenPair(state);
    expect(step).toMatchObject({ technique: Technique.HiddenPair, patternCells: [0, 4], digits: [1, 2] });
    expect(step!.eliminations).toHaveLength(2 * 7);
    expect(step!.eliminations.every(({ cell, digit }) => [0, 4].includes(cell) && digit > 2)).toBe(true);
  });

  it("naked triple: three cells holding only three digits between them", () => {
    const state = openState();
    onlyCandidates(state, 0, [1, 2]);
    onlyCandidates(state, 4, [2, 3]);
    onlyCandidates(state, 8, [1, 3]);
    const step = findNakedTriple(state);
    expect(step).toMatchObject({ technique: Technique.NakedTriple, patternCells: [0, 4, 8], digits: [1, 2, 3] });
    expect(step!.eliminations).toHaveLength(6 * 3);
  });

  it("hidden triple: three digits confined to the same three cells", () => {
    const state = openState();
    for (const digit of [1, 2, 3] as const) removeCandidate(state, without(ROWS[0].cells, [0, 4, 8]), digit);
    const step = findHiddenTriple(state);
    expect(step).toMatchObject({ technique: Technique.HiddenTriple, patternCells: [0, 4, 8], digits: [1, 2, 3] });
    expect(step!.eliminations).toHaveLength(3 * 6);
  });
});

describe("X-Wing", () => {
  it("clears a digit from two columns when two rows hold it only in those columns", () => {
    const state = openState();
    const corners = [cellAt(0, 0), cellAt(0, 4), cellAt(4, 0), cellAt(4, 4)];
    removeCandidate(state, without([...ROWS[0].cells, ...ROWS[4].cells], corners), 4);
    const step = findXWing(state);
    expect(step).toMatchObject({ technique: Technique.XWing, patternCells: corners, digits: [4] });
    const expected = without([...COLUMNS[0].cells, ...COLUMNS[4].cells], corners).map((cell) => ({ cell, digit: 4 }));
    expect(step!.eliminations).toEqual(expected);
  });
});

describe("findNextStep / applyStep", () => {
  it("solves the classic puzzle step by step to its known solution", () => {
    const state = createLogicState(parseGrid(CLASSIC_PUZZLE));
    for (let next = findNextStep(state); next; next = findNextStep(state)) applyStep(state, next);
    expect(formatGrid(state.grid)).toBe(CLASSIC_SOLUTION);
  });

  it("removes a placed digit from every peer's candidates", () => {
    const state = createLogicState(createEmptyGrid());
    applyStep(state, { technique: Technique.NakedSingle, placements: [{ cell: 0, digit: 9 }], eliminations: [], patternCells: [0], digits: [9], units: [] });
    expect(state.grid[0]).toBe(9);
    expect(state.candidates[0]).toBe(0);
    expect(state.candidates[8] & digitBit(9)).toBe(0);
    expect(state.candidates[80] & digitBit(9)).not.toBe(0);
  });

  it("stops on a cell without candidates", () => {
    const state = openState();
    state.candidates[10] = 0;
    expect(findNextStep(state)).toBeNull();
  });
});
