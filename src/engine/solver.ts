// Exact solver: depth-first search that always branches on the empty cell with the fewest
// candidates (MRV). Used units are tracked as bitmasks, so a candidate lookup is three ORs.
import { ALL_CANDIDATES, NO_CANDIDATES, countCandidates, digitBit, type CandidateMask } from "./candidates";
import { CELL_COUNT, EMPTY, GRID_SIZE, boxOf, cloneGrid, columnOf, rowOf, type Digit, type Grid } from "./grid";
import type { Random } from "./random";

export const SolveStatus = {
  Solved: "solved",
  /** The givens break no rule, but no completion exists. */
  Unsolvable: "unsolvable",
  /** The givens already contain a duplicate. */
  Invalid: "invalid",
} as const;
export type SolveStatus = (typeof SolveStatus)[keyof typeof SolveStatus];

export type SolveResult =
  | { status: typeof SolveStatus.Solved; solution: Grid }
  | { status: typeof SolveStatus.Unsolvable }
  | { status: typeof SolveStatus.Invalid };

/** Enough to tell "unique" from "more than one", which is all puzzle checks need. */
export const UNIQUENESS_LIMIT = 2;

interface SearchState {
  cells: Grid;
  rowMasks: Uint16Array;
  columnMasks: Uint16Array;
  boxMasks: Uint16Array;
}

/** Returns null when the givens contain a duplicate. */
function createSearchState(grid: Grid): SearchState | null {
  const state: SearchState = {
    cells: cloneGrid(grid),
    rowMasks: new Uint16Array(GRID_SIZE),
    columnMasks: new Uint16Array(GRID_SIZE),
    boxMasks: new Uint16Array(GRID_SIZE),
  };
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const value = grid[cell];
    if (value === EMPTY) continue;
    const bit = digitBit(value as Digit);
    if ((usedMask(state, cell) & bit) !== 0) return null;
    toggle(state, cell, bit);
  }
  return state;
}

function usedMask(state: SearchState, cell: number): CandidateMask {
  return state.rowMasks[rowOf(cell)] | state.columnMasks[columnOf(cell)] | state.boxMasks[boxOf(cell)];
}

function toggle(state: SearchState, cell: number, bit: CandidateMask): void {
  state.rowMasks[rowOf(cell)] ^= bit;
  state.columnMasks[columnOf(cell)] ^= bit;
  state.boxMasks[boxOf(cell)] ^= bit;
}

function candidateBits(candidates: CandidateMask, random: Random | undefined): CandidateMask[] {
  const bits: CandidateMask[] = [];
  for (let rest = candidates; rest !== 0; rest &= rest - 1) bits.push(rest & -rest);
  return random ? random.shuffle(bits) : bits;
}

/**
 * Visits solutions until `onSolution` returns true (stop) or the space is exhausted.
 * Returns true when stopped early. With `random`, digits are tried in a random order.
 */
function search(state: SearchState, onSolution: (solution: Grid) => boolean, random?: Random): boolean {
  let bestCell = -1;
  let bestCandidates = NO_CANDIDATES;
  let bestCount = GRID_SIZE + 1;
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (state.cells[cell] !== EMPTY) continue;
    const candidates = ALL_CANDIDATES & ~usedMask(state, cell);
    const count = countCandidates(candidates);
    if (count === 0) return false;
    if (count < bestCount) {
      bestCell = cell;
      bestCandidates = candidates;
      bestCount = count;
      if (count === 1) break;
    }
  }
  if (bestCell === -1) return onSolution(cloneGrid(state.cells));

  for (const bit of candidateBits(bestCandidates, random)) {
    state.cells[bestCell] = Math.log2(bit) + 1;
    toggle(state, bestCell, bit);
    const stopped = search(state, onSolution, random);
    toggle(state, bestCell, bit);
    state.cells[bestCell] = EMPTY;
    if (stopped) return true;
  }
  return false;
}

export interface SolveOptions {
  /** Try digits in a seeded random order; solving an empty grid this way yields a random full grid. */
  random?: Random;
}

/** Finds a solution; when there are several, which one is returned depends on `options.random`. */
export function solve(grid: Grid, options: SolveOptions = {}): SolveResult {
  const state = createSearchState(grid);
  if (!state) return { status: SolveStatus.Invalid };
  let found: Grid | null = null;
  search(
    state,
    (solution) => {
      found = solution;
      return true;
    },
    options.random,
  );
  return found ? { status: SolveStatus.Solved, solution: found } : { status: SolveStatus.Unsolvable };
}

/** Counts solutions, stopping at `limit`; an invalid grid has 0. */
export function countSolutions(grid: Grid, limit: number = UNIQUENESS_LIMIT): number {
  if (limit < 1) throw new RangeError(`limit must be at least 1, got ${limit}`);
  const state = createSearchState(grid);
  if (!state) return 0;
  let count = 0;
  search(state, () => ++count >= limit);
  return count;
}

export function hasUniqueSolution(grid: Grid): boolean {
  return countSolutions(grid, UNIQUENESS_LIMIT) === 1;
}
