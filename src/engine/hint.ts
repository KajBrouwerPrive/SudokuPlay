// Which cell a hint fills: the selected cell when it still needs a digit, otherwise the cell a
// human would find next. "Next" comes from the same logic solver that grades puzzles, run on the
// correct digits only, so a wrong digit of the player never steers the hint.
import { CELL_COUNT, EMPTY, cloneGrid, type Digit, type Grid } from "./grid";
import { applyStep, createLogicState, findNextStep } from "./logic";

/** Elimination steps place nothing; this many in a row without a placement means give up on logic. */
const MAX_LOGIC_STEPS = CELL_COUNT * 9;

export interface HintTarget {
  cell: number;
  digit: Digit;
}

function needsDigit(values: Grid, solution: Grid, cell: number): boolean {
  return values[cell] !== solution[cell];
}

/** The first placement the logic solver makes on the correct digits, or null if logic gets stuck. */
function nextLogicalPlacement(values: Grid, solution: Grid): HintTarget | null {
  const correctOnly = cloneGrid(values);
  for (let cell = 0; cell < CELL_COUNT; cell++) if (correctOnly[cell] !== solution[cell]) correctOnly[cell] = EMPTY;
  const state = createLogicState(correctOnly);
  for (let attempt = 0; attempt < MAX_LOGIC_STEPS; attempt++) {
    const step = findNextStep(state);
    if (!step) return null;
    // A placement after eliminations is still one the player can find from the current board.
    const placement = step.placements.find(({ cell }) => needsDigit(values, solution, cell));
    if (placement) return placement;
    applyStep(state, step);
  }
  return null;
}

/** Where a hint goes, or null when every cell is already correct. */
export function findHintTarget(values: Grid, solution: Grid, preferredCell: number | null): HintTarget | null {
  if (preferredCell !== null && needsDigit(values, solution, preferredCell)) {
    return { cell: preferredCell, digit: solution[preferredCell] as Digit };
  }
  const logical = nextLogicalPlacement(values, solution);
  if (logical) return logical;
  // Beyond the solver's techniques: any cell that still needs its digit, in reading order.
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (needsDigit(values, solution, cell)) return { cell, digit: solution[cell] as Digit };
  }
  return null;
}
