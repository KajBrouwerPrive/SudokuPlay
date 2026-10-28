// Validity-preserving transformations: relabel digits, shuffle rows within a band and the bands
// themselves (same for columns and stacks), and optionally transpose. A transformed puzzle has
// one solution exactly when the original does, and needs the same techniques, so one bank puzzle
// yields about 10^12 distinct-looking puzzles of the same difficulty.
import { BOX_SIZE, DIGITS, EMPTY, GRID_SIZE, cellAt, createEmptyGrid, type Digit, type Grid } from "./grid";
import type { Random } from "./random";

export interface GridTransform {
  /** `digitMap[digit - 1]` is the digit it becomes. */
  digitMap: readonly Digit[];
  /** Row `r` of the result is taken from row `rowOrder[r]` of the source. */
  rowOrder: readonly number[];
  /** Column `c` of the result is taken from column `columnOrder[c]` of the source. */
  columnOrder: readonly number[];
  /** Swap rows and columns after reordering. */
  transpose: boolean;
}

const BAND_INDICES: readonly number[] = Array.from({ length: BOX_SIZE }, (_, index) => index);
const TRANSPOSE_PROBABILITY = 0.5;

export const IDENTITY_TRANSFORM: GridTransform = {
  digitMap: DIGITS,
  rowOrder: Array.from({ length: GRID_SIZE }, (_, index) => index),
  columnOrder: Array.from({ length: GRID_SIZE }, (_, index) => index),
  transpose: false,
};

/** Shuffles the bands, then the lines inside each band, keeping every line in its band. */
function randomLineOrder(random: Random): number[] {
  return random
    .shuffle(BAND_INDICES)
    .flatMap((band) => random.shuffle(BAND_INDICES).map((offset) => band * BOX_SIZE + offset));
}

export function randomTransform(random: Random): GridTransform {
  return {
    digitMap: random.shuffle(DIGITS),
    rowOrder: randomLineOrder(random),
    columnOrder: randomLineOrder(random),
    transpose: random.next() < TRANSPOSE_PROBABILITY,
  };
}

export function applyTransform(grid: Grid, transform: GridTransform): Grid {
  const result = createEmptyGrid();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let column = 0; column < GRID_SIZE; column++) {
      const value = grid[cellAt(transform.rowOrder[row], transform.columnOrder[column])];
      const target = transform.transpose ? cellAt(column, row) : cellAt(row, column);
      result[target] = value === EMPTY ? EMPTY : transform.digitMap[value - 1];
    }
  }
  return result;
}
