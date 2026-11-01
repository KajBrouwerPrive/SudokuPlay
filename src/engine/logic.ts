// Human-style solving: each technique finds one step (placements and/or candidate eliminations)
// and reports the cells and unit involved, so the same steps can grade puzzles and drive
// animated hints. Techniques are tried from easiest to hardest.
import { candidateDigits, computeAllCandidates, countCandidates, digitBit, hasCandidate, type CandidateMask } from "./candidates";
import {
  ALL_UNITS,
  BOXES,
  COLUMNS,
  DIGITS,
  EMPTY,
  PEERS,
  ROWS,
  boxOf,
  cloneGrid,
  columnOf,
  rowOf,
  type Digit,
  type Grid,
  type Unit,
} from "./grid";

export const Technique = {
  HiddenSingle: "hiddenSingle",
  NakedSingle: "nakedSingle",
  Pointing: "pointing",
  Claiming: "claiming",
  NakedPair: "nakedPair",
  HiddenPair: "hiddenPair",
  NakedTriple: "nakedTriple",
  HiddenTriple: "hiddenTriple",
  XWing: "xWing",
} as const;
export type Technique = (typeof Technique)[keyof typeof Technique];

export interface CellDigit {
  cell: number;
  digit: Digit;
}

export interface LogicStep {
  technique: Technique;
  /** Digits this step places (singles only). */
  placements: CellDigit[];
  /** Candidates this step removes. */
  eliminations: CellDigit[];
  /** The cells that form the pattern, for highlighting. */
  patternCells: number[];
  /** The digits the pattern is about. */
  digits: Digit[];
  /** The units the pattern lives in. */
  units: Unit[];
}

/** A grid plus the candidates still open in each empty cell. Mutated by `applyStep`. */
export interface LogicState {
  grid: Grid;
  candidates: Uint16Array;
}

type StepFinder = (state: LogicState) => LogicStep | null;

const PAIR_SIZE = 2;
const TRIPLE_SIZE = 3;

export function createLogicState(grid: Grid): LogicState {
  return { grid: cloneGrid(grid), candidates: computeAllCandidates(grid) };
}

export function applyStep(state: LogicState, step: LogicStep): void {
  for (const { cell, digit } of step.placements) {
    const bit = digitBit(digit);
    state.grid[cell] = digit;
    state.candidates[cell] = 0;
    for (const peer of PEERS[cell]) state.candidates[peer] &= ~bit;
  }
  for (const { cell, digit } of step.eliminations) state.candidates[cell] &= ~digitBit(digit);
}

function emptyCellsWith(state: LogicState, cells: readonly number[], digit: Digit): number[] {
  const bit = digitBit(digit);
  return cells.filter((cell) => state.grid[cell] === EMPTY && (state.candidates[cell] & bit) !== 0);
}

function* combinations<T>(items: readonly T[], size: number, start = 0, chosen: T[] = []): Generator<T[]> {
  if (chosen.length === size) {
    yield [...chosen];
    return;
  }
  for (let index = start; index <= items.length - (size - chosen.length); index++) {
    chosen.push(items[index]);
    yield* combinations(items, size, index + 1, chosen);
    chosen.pop();
  }
}

function step(
  technique: Technique,
  fields: Partial<Omit<LogicStep, "technique">>,
): LogicStep {
  return { technique, placements: [], eliminations: [], patternCells: [], digits: [], units: [], ...fields };
}

export const findHiddenSingle: StepFinder = (state) => {
  for (const unit of ALL_UNITS) {
    for (const digit of DIGITS) {
      const cells = emptyCellsWith(state, unit.cells, digit);
      if (cells.length !== 1) continue;
      const [cell] = cells;
      return step(Technique.HiddenSingle, { placements: [{ cell, digit }], patternCells: [cell], digits: [digit], units: [unit] });
    }
  }
  return null;
};

export const findNakedSingle: StepFinder = (state) => {
  for (let cell = 0; cell < state.grid.length; cell++) {
    if (state.grid[cell] !== EMPTY || countCandidates(state.candidates[cell]) !== 1) continue;
    const [digit] = candidateDigits(state.candidates[cell]);
    return step(Technique.NakedSingle, { placements: [{ cell, digit }], patternCells: [cell], digits: [digit] });
  }
  return null;
};

/**
 * Locked candidates: when a digit's cells in one unit all lie in a second unit, it cannot go
 * anywhere else in that second unit.
 */
function findLockedCandidates(
  state: LogicState,
  technique: Technique,
  sources: readonly Unit[],
  targetsOf: (cell: number) => Unit[],
): LogicStep | null {
  for (const source of sources) {
    for (const digit of DIGITS) {
      const cells = emptyCellsWith(state, source.cells, digit);
      if (cells.length < PAIR_SIZE) continue;
      for (const target of targetsOf(cells[0])) {
        if (!cells.every((cell) => target.cells.includes(cell))) continue;
        const outside = target.cells.filter((cell) => !source.cells.includes(cell));
        const eliminations = emptyCellsWith(state, outside, digit).map((cell) => ({ cell, digit }));
        if (eliminations.length > 0) {
          return step(technique, { eliminations, patternCells: cells, digits: [digit], units: [source, target] });
        }
      }
    }
  }
  return null;
}

const LINES: readonly Unit[] = [...ROWS, ...COLUMNS];

/** A digit confined to one row or column within a box is removed from the rest of that line. */
export const findPointing: StepFinder = (state) =>
  findLockedCandidates(state, Technique.Pointing, BOXES, (cell) => [ROWS[rowOf(cell)], COLUMNS[columnOf(cell)]]);

/** A digit confined to one box within a row or column is removed from the rest of that box. */
export const findClaiming: StepFinder = (state) =>
  findLockedCandidates(state, Technique.Claiming, LINES, (cell) => [BOXES[boxOf(cell)]]);

/** N cells in a unit whose candidates together are exactly N digits: those digits leave the rest of the unit. */
function findNakedSubset(technique: Technique, size: number): StepFinder {
  return (state) => {
    for (const unit of ALL_UNITS) {
      const open = unit.cells.filter((cell) => {
        const count = countCandidates(state.candidates[cell]);
        return state.grid[cell] === EMPTY && count >= PAIR_SIZE && count <= size;
      });
      for (const subset of combinations(open, size)) {
        const union = subset.reduce<CandidateMask>((mask, cell) => mask | state.candidates[cell], 0);
        if (countCandidates(union) !== size) continue;
        const digits = candidateDigits(union);
        const eliminations = unit.cells
          .filter((cell) => state.grid[cell] === EMPTY && !subset.includes(cell))
          .flatMap((cell) => digits.filter((digit) => hasCandidate(state.candidates[cell], digit)).map((digit) => ({ cell, digit })));
        if (eliminations.length > 0) return step(technique, { eliminations, patternCells: subset, digits, units: [unit] });
      }
    }
    return null;
  };
}

/** N digits that fit in only the same N cells of a unit: those cells lose every other candidate. */
function findHiddenSubset(technique: Technique, size: number): StepFinder {
  return (state) => {
    for (const unit of ALL_UNITS) {
      const positions = new Map<Digit, number[]>();
      for (const digit of DIGITS) {
        const cells = emptyCellsWith(state, unit.cells, digit);
        if (cells.length >= PAIR_SIZE && cells.length <= size) positions.set(digit, cells);
      }
      for (const digits of combinations([...positions.keys()], size)) {
        const cells = [...new Set(digits.flatMap((digit) => positions.get(digit)!))].sort((a, b) => a - b);
        if (cells.length !== size) continue;
        const eliminations = cells.flatMap((cell) =>
          candidateDigits(state.candidates[cell])
            .filter((digit) => !digits.includes(digit))
            .map((digit) => ({ cell, digit })),
        );
        if (eliminations.length > 0) return step(technique, { eliminations, patternCells: cells, digits, units: [unit] });
      }
    }
    return null;
  };
}

/**
 * When a digit fits in exactly the same two columns in two rows, those four cells hold it twice,
 * so the rest of both columns lose it (and the same with rows and columns swapped).
 */
export const findXWing: StepFinder = (state) => {
  const orientations: [readonly Unit[], readonly Unit[], (cell: number) => number][] = [
    [ROWS, COLUMNS, columnOf],
    [COLUMNS, ROWS, rowOf],
  ];
  for (const digit of DIGITS) {
    for (const [baseLines, coverLines, coverIndexOf] of orientations) {
      const candidatesPerLine = baseLines
        .map((line) => ({ line, cells: emptyCellsWith(state, line.cells, digit) }))
        .filter(({ cells }) => cells.length === PAIR_SIZE);
      for (const [first, second] of combinations(candidatesPerLine, PAIR_SIZE)) {
        const firstCovers = first.cells.map(coverIndexOf);
        const secondCovers = second.cells.map(coverIndexOf);
        if (firstCovers[0] !== secondCovers[0] || firstCovers[1] !== secondCovers[1]) continue;
        const patternCells = [...first.cells, ...second.cells].sort((a, b) => a - b);
        const covers = firstCovers.map((index) => coverLines[index]);
        const eliminations = covers
          .flatMap((cover) => emptyCellsWith(state, cover.cells, digit))
          .filter((cell) => !patternCells.includes(cell))
          .map((cell) => ({ cell, digit }));
        if (eliminations.length > 0) {
          return step(Technique.XWing, { eliminations, patternCells, digits: [digit], units: [first.line, second.line, ...covers] });
        }
      }
    }
  }
  return null;
};

export const findNakedPair = findNakedSubset(Technique.NakedPair, PAIR_SIZE);
export const findHiddenPair = findHiddenSubset(Technique.HiddenPair, PAIR_SIZE);
export const findNakedTriple = findNakedSubset(Technique.NakedTriple, TRIPLE_SIZE);
export const findHiddenTriple = findHiddenSubset(Technique.HiddenTriple, TRIPLE_SIZE);

/** Every technique in the order a person would try them. */
export const TECHNIQUE_FINDERS: readonly (readonly [Technique, StepFinder])[] = [
  [Technique.HiddenSingle, findHiddenSingle],
  [Technique.NakedSingle, findNakedSingle],
  [Technique.Pointing, findPointing],
  [Technique.Claiming, findClaiming],
  [Technique.NakedPair, findNakedPair],
  [Technique.HiddenPair, findHiddenPair],
  [Technique.NakedTriple, findNakedTriple],
  [Technique.HiddenTriple, findHiddenTriple],
  [Technique.XWing, findXWing],
];

function hasDeadCell(state: LogicState): boolean {
  for (let cell = 0; cell < state.grid.length; cell++) {
    if (state.grid[cell] === EMPTY && state.candidates[cell] === 0) return true;
  }
  return false;
}

/** The easiest available step, or null when the grid is full, contradictory, or beyond these techniques. */
export function findNextStep(state: LogicState): LogicStep | null {
  if (hasDeadCell(state)) return null;
  for (const [, finder] of TECHNIQUE_FINDERS) {
    const found = finder(state);
    if (found) return found;
  }
  return null;
}
