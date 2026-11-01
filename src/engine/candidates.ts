// Candidate sets as 9-bit masks: bit (digit - 1) is set when the digit is still possible.
// The same representation backs the solver and, later, the player's pencil marks.
import { CELL_COUNT, DIGITS, EMPTY, PEERS, type Digit, type Grid } from "./grid";

export type CandidateMask = number;

export const NO_CANDIDATES: CandidateMask = 0;
export const ALL_CANDIDATES: CandidateMask = 0b1_1111_1111;

export function digitBit(digit: Digit): CandidateMask {
  return 1 << (digit - 1);
}

export function hasCandidate(mask: CandidateMask, digit: Digit): boolean {
  return (mask & digitBit(digit)) !== 0;
}

export function countCandidates(mask: CandidateMask): number {
  let count = 0;
  for (let rest = mask; rest !== 0; rest &= rest - 1) count++;
  return count;
}

export function candidateDigits(mask: CandidateMask): Digit[] {
  return DIGITS.filter((digit) => hasCandidate(mask, digit));
}

/** The digits a cell can still take given its peers; a filled cell has no candidates. */
export function candidatesFor(grid: Grid, cell: number): CandidateMask {
  if (grid[cell] !== EMPTY) return NO_CANDIDATES;
  let used = NO_CANDIDATES;
  for (const peer of PEERS[cell]) {
    const value = grid[peer];
    if (value !== EMPTY) used |= digitBit(value as Digit);
  }
  return ALL_CANDIDATES & ~used;
}

export function computeAllCandidates(grid: Grid): Uint16Array {
  const candidates = new Uint16Array(CELL_COUNT);
  for (let cell = 0; cell < CELL_COUNT; cell++) candidates[cell] = candidatesFor(grid, cell);
  return candidates;
}
