// Rule checks. Conflicts are returned as cell lists so the UI can point at (and animate) them.
import { ALL_UNITS, EMPTY, PEERS, type Digit, type Grid, type Unit } from "./grid";

export interface Conflict {
  unit: Unit;
  digit: Digit;
  /** Every cell in the unit holding the duplicated digit, ascending. */
  cells: number[];
}

/** Peers of `cell` that already hold `digit`; empty when placing it there breaks no rule. */
export function conflictingPeers(grid: Grid, cell: number, digit: Digit): number[] {
  return PEERS[cell].filter((peer) => grid[peer] === digit);
}

export function isValidPlacement(grid: Grid, cell: number, digit: Digit): boolean {
  return conflictingPeers(grid, cell, digit).length === 0;
}

/** Every duplicated digit per unit; a cell in several conflicting units appears in each conflict. */
export function findConflicts(grid: Grid): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const unit of ALL_UNITS) {
    const cellsByDigit = new Map<Digit, number[]>();
    for (const cell of unit.cells) {
      const value = grid[cell];
      if (value === EMPTY) continue;
      const digit = value as Digit;
      const cells = cellsByDigit.get(digit) ?? [];
      cells.push(cell);
      cellsByDigit.set(digit, cells);
    }
    for (const [digit, cells] of cellsByDigit) if (cells.length > 1) conflicts.push({ unit, digit, cells });
  }
  return conflicts;
}

/** All cells involved in any conflict, ascending and without duplicates. */
export function findConflictingCells(grid: Grid): number[] {
  const cells = new Set<number>();
  for (const conflict of findConflicts(grid)) for (const cell of conflict.cells) cells.add(cell);
  return [...cells].sort((a, b) => a - b);
}

export function isComplete(grid: Grid): boolean {
  return !grid.includes(EMPTY);
}

export function isSolved(grid: Grid): boolean {
  return isComplete(grid) && findConflicts(grid).length === 0;
}

/** True when `solution` keeps every given of `puzzle` unchanged. */
export function respectsGivens(puzzle: Grid, solution: Grid): boolean {
  return puzzle.every((value, cell) => value === EMPTY || value === solution[cell]);
}
