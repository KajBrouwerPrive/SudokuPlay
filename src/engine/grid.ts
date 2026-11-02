// Grid model: 81 cells in row-major order, each holding 0 (empty) or a digit 1-9.
// Unit and peer lookups are computed once at module load, so hot paths only index arrays.

export const BOX_SIZE = 3;
export const GRID_SIZE = BOX_SIZE * BOX_SIZE;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
export const EMPTY = 0;
export const MIN_DIGIT = 1;
export const MAX_DIGIT = GRID_SIZE;

/** Characters accepted as an empty cell when parsing. */
const EMPTY_CHARACTERS = new Set([".", "0"]);
const SERIALIZED_EMPTY = ".";

export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type CellValue = Digit | typeof EMPTY;

/** A grid is a flat array of 81 cell values; treat it as immutable outside the engine. */
export type Grid = Uint8Array;

export const UnitKind = {
  Row: "row",
  Column: "column",
  Box: "box",
} as const;
export type UnitKind = (typeof UnitKind)[keyof typeof UnitKind];

export interface Unit {
  kind: UnitKind;
  /** 0-8: row number, column number, or box number (left to right, top to bottom). */
  index: number;
  cells: readonly number[];
}

export const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function rowOf(cell: number): number {
  return Math.floor(cell / GRID_SIZE);
}

export function columnOf(cell: number): number {
  return cell % GRID_SIZE;
}

export function boxOf(cell: number): number {
  return Math.floor(rowOf(cell) / BOX_SIZE) * BOX_SIZE + Math.floor(columnOf(cell) / BOX_SIZE);
}

export function cellAt(row: number, column: number): number {
  return row * GRID_SIZE + column;
}

export function isDigit(value: number): value is Digit {
  return Number.isInteger(value) && value >= MIN_DIGIT && value <= MAX_DIGIT;
}

function buildUnits(kind: UnitKind, unitOf: (cell: number) => number): Unit[] {
  const cellsPerUnit: number[][] = Array.from({ length: GRID_SIZE }, () => []);
  for (let cell = 0; cell < CELL_COUNT; cell++) cellsPerUnit[unitOf(cell)].push(cell);
  return cellsPerUnit.map((cells, index) => ({ kind, index, cells }));
}

export const ROWS: readonly Unit[] = buildUnits(UnitKind.Row, rowOf);
export const COLUMNS: readonly Unit[] = buildUnits(UnitKind.Column, columnOf);
export const BOXES: readonly Unit[] = buildUnits(UnitKind.Box, boxOf);
export const ALL_UNITS: readonly Unit[] = [...ROWS, ...COLUMNS, ...BOXES];

/** The three units (row, column, box) each cell belongs to. */
export const UNITS_OF_CELL: readonly (readonly Unit[])[] = Array.from({ length: CELL_COUNT }, (_, cell) => [
  ROWS[rowOf(cell)],
  COLUMNS[columnOf(cell)],
  BOXES[boxOf(cell)],
]);

/** The 20 other cells that share a row, column or box with each cell. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: CELL_COUNT }, (_, cell) => {
  const peers = new Set<number>();
  for (const unit of UNITS_OF_CELL[cell]) for (const other of unit.cells) if (other !== cell) peers.add(other);
  return [...peers].sort((a, b) => a - b);
});

export function createEmptyGrid(): Grid {
  return new Uint8Array(CELL_COUNT);
}

export function cloneGrid(grid: Grid): Grid {
  return new Uint8Array(grid);
}

/**
 * Parses an 81-character string; digits 1-9 are givens, "." or "0" are empty cells.
 * Whitespace is ignored so fixtures can be written as nine lines.
 */
export function parseGrid(text: string): Grid {
  const characters = text.replace(/\s/g, "");
  if (characters.length !== CELL_COUNT) {
    throw new Error(`A grid needs ${CELL_COUNT} cells, got ${characters.length}`);
  }
  const grid = createEmptyGrid();
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const character = characters[cell];
    if (EMPTY_CHARACTERS.has(character)) continue;
    const value = Number(character);
    if (!isDigit(value)) throw new Error(`Invalid character "${character}" at cell ${cell}`);
    grid[cell] = value;
  }
  return grid;
}

/** Serializes to the 81-character form, with "." for empty cells. */
export function formatGrid(grid: Grid): string {
  return Array.from(grid, (value) => (value === EMPTY ? SERIALIZED_EMPTY : String(value))).join("");
}

export function countFilled(grid: Grid): number {
  let filled = 0;
  for (const value of grid) if (value !== EMPTY) filled++;
  return filled;
}

export function countEmpty(grid: Grid): number {
  return CELL_COUNT - countFilled(grid);
}
