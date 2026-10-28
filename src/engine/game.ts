// Game rules as a pure reducer: `applyAction(state, action)` returns the next state plus the
// domain events the move caused. The UI renders state and animates events; it never decides rules.
//
// Event order within one transition is fixed, so animations can be choreographed from it:
//   CellPlaced → NotesCleared → ConflictDetected → MistakeMade → UnitCompleted* → DigitCompleted → PuzzleSolved
import { digitBit, hasCandidate } from "./candidates";
import { CELL_COUNT, DIGITS, EMPTY, PEERS, UNITS_OF_CELL, cloneGrid, isDigit, type Digit, type Grid, type Unit } from "./grid";
import type { Difficulty } from "./grader";
import type { Puzzle } from "./puzzleBank";
import { conflictingPeers } from "./validator";

/** Undo steps kept; older moves can no longer be undone. */
export const MAX_HISTORY = 1000;

export const GameStatus = {
  Playing: "playing",
  Solved: "solved",
} as const;
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];

/** What undo and redo restore. Mistakes are not part of it: undoing a wrong move does not erase the mistake. */
interface BoardSnapshot {
  values: Grid;
  /** Pencil marks per cell as candidate masks. */
  notes: Uint16Array;
}

/** Treat as immutable: every transition returns new arrays instead of changing these. */
export interface GameState extends BoardSnapshot {
  /** The givens; their cells cannot change. */
  givens: Grid;
  solution: Grid;
  difficulty: Difficulty;
  seed: number;
  mistakes: number;
  status: GameStatus;
  undoStack: readonly BoardSnapshot[];
  redoStack: readonly BoardSnapshot[];
}

export const ActionType = {
  Place: "place",
  Erase: "erase",
  ToggleNote: "toggleNote",
  Undo: "undo",
  Redo: "redo",
} as const;

export type GameAction =
  | { type: typeof ActionType.Place; cell: number; digit: Digit }
  | { type: typeof ActionType.Erase; cell: number }
  | { type: typeof ActionType.ToggleNote; cell: number; digit: Digit }
  | { type: typeof ActionType.Undo }
  | { type: typeof ActionType.Redo };

export const GameEventType = {
  CellPlaced: "cellPlaced",
  CellErased: "cellErased",
  NoteToggled: "noteToggled",
  /** Placing a digit removed it from the notes of these peers. */
  NotesCleared: "notesCleared",
  /** The placed digit already sits in a peer; the player can see the rule break. */
  ConflictDetected: "conflictDetected",
  /** The placed digit differs from the solution, conflict or not. */
  MistakeMade: "mistakeMade",
  /** A row, column or box is now completely and correctly filled. */
  UnitCompleted: "unitCompleted",
  /** All nine of a digit are placed correctly. */
  DigitCompleted: "digitCompleted",
  PuzzleSolved: "puzzleSolved",
  MoveUndone: "moveUndone",
  MoveRedone: "moveRedone",
  MoveRejected: "moveRejected",
} as const;

export const RejectReason = {
  GivenCell: "givenCell",
  /** Notes only go in empty cells. */
  CellFilled: "cellFilled",
  GameOver: "gameOver",
  NothingToUndo: "nothingToUndo",
  NothingToRedo: "nothingToRedo",
} as const;
export type RejectReason = (typeof RejectReason)[keyof typeof RejectReason];

export type GameEvent =
  | { type: typeof GameEventType.CellPlaced; cell: number; digit: Digit; correct: boolean }
  | { type: typeof GameEventType.CellErased; cell: number; digit: Digit | null }
  | { type: typeof GameEventType.NoteToggled; cell: number; digit: Digit; added: boolean }
  | { type: typeof GameEventType.NotesCleared; digit: Digit; cells: number[] }
  | { type: typeof GameEventType.ConflictDetected; cell: number; digit: Digit; conflictingCells: number[] }
  | { type: typeof GameEventType.MistakeMade; cell: number; digit: Digit; mistakes: number }
  | { type: typeof GameEventType.UnitCompleted; unit: Unit }
  /** `cells` holds all nine cells with this digit, in reading order. */
  | { type: typeof GameEventType.DigitCompleted; digit: Digit; cells: number[] }
  | { type: typeof GameEventType.PuzzleSolved; mistakes: number }
  | { type: typeof GameEventType.MoveUndone; changedCells: number[] }
  | { type: typeof GameEventType.MoveRedone; changedCells: number[] }
  | { type: typeof GameEventType.MoveRejected; action: GameAction; reason: RejectReason; cell: number | null };

export interface GameTransition {
  state: GameState;
  events: GameEvent[];
}

export function createGame({ puzzle, solution, difficulty, seed }: Puzzle): GameState {
  return {
    givens: cloneGrid(puzzle),
    solution: cloneGrid(solution),
    values: cloneGrid(puzzle),
    notes: new Uint16Array(CELL_COUNT),
    difficulty,
    seed,
    mistakes: 0,
    status: GameStatus.Playing,
    undoStack: [],
    redoStack: [],
  };
}

export function isGiven(state: GameState, cell: number): boolean {
  return state.givens[cell] !== EMPTY;
}

/** How many of each digit are still to be placed correctly, for a number pad that counts down. */
export function remainingByDigit(state: GameState): Record<Digit, number> {
  const remaining = Object.fromEntries(DIGITS.map((digit) => [digit, DIGITS.length])) as Record<Digit, number>;
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const value = state.values[cell];
    if (value !== EMPTY && value === state.solution[cell]) remaining[value as Digit]--;
  }
  return remaining;
}

function assertCell(cell: number): void {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) throw new RangeError(`cell must be 0-${CELL_COUNT - 1}, got ${cell}`);
}

function assertDigit(digit: number): void {
  if (!isDigit(digit)) throw new RangeError(`digit must be 1-9, got ${digit}`);
}

function reject(state: GameState, action: GameAction, reason: RejectReason, cell: number | null = null): GameTransition {
  return { state, events: [{ type: GameEventType.MoveRejected, action, reason, cell }] };
}

function snapshot(state: GameState): BoardSnapshot {
  return { values: state.values, notes: state.notes };
}

/** A new move: remember the board for undo and forget anything that could be redone. */
function commit(state: GameState, board: BoardSnapshot, changes: Partial<GameState> = {}): GameState {
  const undoStack = [...state.undoStack, snapshot(state)].slice(-MAX_HISTORY);
  return { ...state, ...changes, ...board, undoStack, redoStack: [] };
}

function isCorrect(values: Grid, solution: Grid, cell: number): boolean {
  return values[cell] !== EMPTY && values[cell] === solution[cell];
}

function cellsWithDigit(grid: Grid, digit: Digit): number[] {
  const cells: number[] = [];
  grid.forEach((value, cell) => {
    if (value === digit) cells.push(cell);
  });
  return cells;
}

function place(state: GameState, action: Extract<GameAction, { type: typeof ActionType.Place }>): GameTransition {
  const { cell, digit } = action;
  if (isGiven(state, cell)) return reject(state, action, RejectReason.GivenCell, cell);
  if (state.values[cell] === digit) return { state, events: [] };

  const values = cloneGrid(state.values);
  const notes = new Uint16Array(state.notes);
  values[cell] = digit;
  notes[cell] = 0;
  const bit = digitBit(digit);
  const clearedNotes = PEERS[cell].filter((peer) => hasCandidate(notes[peer], digit));
  for (const peer of clearedNotes) notes[peer] &= ~bit;

  const correct = digit === state.solution[cell];
  const mistakes = correct ? state.mistakes : state.mistakes + 1;
  const solved = values.every((value, index) => value === state.solution[index]);
  const next = commit(state, { values, notes }, { mistakes, status: solved ? GameStatus.Solved : GameStatus.Playing });

  const events: GameEvent[] = [{ type: GameEventType.CellPlaced, cell, digit, correct }];
  if (clearedNotes.length > 0) events.push({ type: GameEventType.NotesCleared, digit, cells: clearedNotes });
  const conflicts = conflictingPeers(values, cell, digit);
  if (conflicts.length > 0) events.push({ type: GameEventType.ConflictDetected, cell, digit, conflictingCells: conflicts });
  if (!correct) events.push({ type: GameEventType.MistakeMade, cell, digit, mistakes });
  if (correct) {
    for (const unit of UNITS_OF_CELL[cell]) {
      if (unit.cells.every((member) => isCorrect(values, state.solution, member))) events.push({ type: GameEventType.UnitCompleted, unit });
    }
    const digitCells = cellsWithDigit(state.solution, digit);
    if (digitCells.every((member) => values[member] === digit)) events.push({ type: GameEventType.DigitCompleted, digit, cells: digitCells });
  }
  if (solved) events.push({ type: GameEventType.PuzzleSolved, mistakes });
  return { state: next, events };
}

function erase(state: GameState, action: Extract<GameAction, { type: typeof ActionType.Erase }>): GameTransition {
  const { cell } = action;
  if (isGiven(state, cell)) return reject(state, action, RejectReason.GivenCell, cell);
  const value = state.values[cell];
  if (value === EMPTY && state.notes[cell] === 0) return { state, events: [] };

  // A filled cell loses its digit; an empty one loses its notes.
  const values = cloneGrid(state.values);
  const notes = new Uint16Array(state.notes);
  if (value !== EMPTY) values[cell] = EMPTY;
  else notes[cell] = 0;
  return {
    state: commit(state, { values, notes }),
    events: [{ type: GameEventType.CellErased, cell, digit: value === EMPTY ? null : (value as Digit) }],
  };
}

function toggleNote(state: GameState, action: Extract<GameAction, { type: typeof ActionType.ToggleNote }>): GameTransition {
  const { cell, digit } = action;
  if (isGiven(state, cell)) return reject(state, action, RejectReason.GivenCell, cell);
  if (state.values[cell] !== EMPTY) return reject(state, action, RejectReason.CellFilled, cell);
  const notes = new Uint16Array(state.notes);
  notes[cell] ^= digitBit(digit);
  return {
    state: commit(state, { values: state.values, notes }),
    events: [{ type: GameEventType.NoteToggled, cell, digit, added: hasCandidate(notes[cell], digit) }],
  };
}

function changedCells(before: BoardSnapshot, after: BoardSnapshot): number[] {
  const cells: number[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (before.values[cell] !== after.values[cell] || before.notes[cell] !== after.notes[cell]) cells.push(cell);
  }
  return cells;
}

function undo(state: GameState, action: GameAction): GameTransition {
  const previous = state.undoStack.at(-1);
  if (!previous) return reject(state, action, RejectReason.NothingToUndo);
  return {
    state: { ...state, ...previous, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, snapshot(state)] },
    events: [{ type: GameEventType.MoveUndone, changedCells: changedCells(state, previous) }],
  };
}

function redo(state: GameState, action: GameAction): GameTransition {
  const next = state.redoStack.at(-1);
  if (!next) return reject(state, action, RejectReason.NothingToRedo);
  return {
    state: { ...state, ...next, redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack, snapshot(state)] },
    events: [{ type: GameEventType.MoveRedone, changedCells: changedCells(state, next) }],
  };
}

/**
 * Applies one player action. Invalid input (a cell outside 0-80, a digit outside 1-9) is a
 * programming error and throws; a move the rules forbid returns a MoveRejected event instead.
 */
export function applyAction(state: GameState, action: GameAction): GameTransition {
  if ("cell" in action) assertCell(action.cell);
  if ("digit" in action) assertDigit(action.digit);
  if (state.status === GameStatus.Solved) return reject(state, action, RejectReason.GameOver, "cell" in action ? action.cell : null);
  switch (action.type) {
    case ActionType.Place:
      return place(state, action);
    case ActionType.Erase:
      return erase(state, action);
    case ActionType.ToggleNote:
      return toggleNote(state, action);
    case ActionType.Undo:
      return undo(state, action);
    case ActionType.Redo:
      return redo(state, action);
  }
}
