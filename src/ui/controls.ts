// Pure input and display logic for the board, kept out of components so it can be unit-tested.
import {
  ActionType,
  CELL_COUNT,
  EMPTY,
  GRID_SIZE,
  PEERS,
  candidateDigits,
  cellAt,
  columnOf,
  findConflictingCells,
  isDigit,
  rowOf,
  type Digit,
  type GameAction,
  type GameState,
} from "../engine";

export const Direction = {
  Up: "up",
  Down: "down",
  Left: "left",
  Right: "right",
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const CommandType = {
  Input: "input",
  Erase: "erase",
  Undo: "undo",
  Redo: "redo",
  Move: "move",
  ToggleNotesMode: "toggleNotesMode",
} as const;

export type Command =
  | { type: typeof CommandType.Input; digit: Digit; asNote: boolean }
  | { type: typeof CommandType.Erase }
  | { type: typeof CommandType.Undo }
  | { type: typeof CommandType.Redo }
  | { type: typeof CommandType.Move; direction: Direction }
  | { type: typeof CommandType.ToggleNotesMode };

/** The parts of a KeyboardEvent the mapping needs, so tests can pass plain objects. */
export interface KeyInput {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** True for the auto-repeat presses of a held key. */
  repeat: boolean;
}

const ARROW_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: Direction.Up,
  ArrowDown: Direction.Down,
  ArrowLeft: Direction.Left,
  ArrowRight: Direction.Right,
};
const ERASE_KEYS = new Set(["Backspace", "Delete", "0"]);
const NOTES_MODE_KEY = "n";
const UNDO_KEY = "z";
const REDO_KEY = "y";
/** Matches the physical digit keys, so Shift+3 still reads as 3 on any layout. */
const DIGIT_CODE = /^(?:Digit|Numpad)([1-9])$/;

function digitFrom(input: KeyInput): Digit | null {
  const fromCode = DIGIT_CODE.exec(input.code)?.[1];
  const value = Number(fromCode ?? input.key);
  return isDigit(value) ? value : null;
}

/** Holding these keys repeats them: gliding across the board or rewinding many moves. */
const REPEATABLE_COMMANDS: ReadonlySet<Command["type"]> = new Set([CommandType.Move, CommandType.Undo, CommandType.Redo]);

/**
 * Maps a key press to a command. Shift flips the notes mode for one digit, so players can
 * pencil in without switching modes. Returns null for keys the board does not handle, and for
 * auto-repeats of keys that would otherwise flicker (a note or the notes mode toggling on and off).
 */
export function keyToCommand(input: KeyInput, notesMode: boolean): Command | null {
  const command = commandForKey(input, notesMode);
  return command && input.repeat && !REPEATABLE_COMMANDS.has(command.type) ? null : command;
}

function commandForKey(input: KeyInput, notesMode: boolean): Command | null {
  const key = input.key.toLowerCase();
  if (input.ctrlKey || input.metaKey) {
    if (key === UNDO_KEY && !input.shiftKey) return { type: CommandType.Undo };
    if (key === REDO_KEY || (key === UNDO_KEY && input.shiftKey)) return { type: CommandType.Redo };
    return null;
  }
  if (input.altKey) return null;
  const direction = ARROW_DIRECTIONS[input.key];
  if (direction) return { type: CommandType.Move, direction };
  if (ERASE_KEYS.has(input.key)) return { type: CommandType.Erase };
  if (key === NOTES_MODE_KEY) return { type: CommandType.ToggleNotesMode };
  const digit = digitFrom(input);
  if (digit) return { type: CommandType.Input, digit, asNote: notesMode !== input.shiftKey };
  return null;
}

/** Moves one cell, wrapping around at the edges. */
export function moveSelection(cell: number, direction: Direction): number {
  const row = rowOf(cell);
  const column = columnOf(cell);
  const wrap = (index: number) => (index + GRID_SIZE) % GRID_SIZE;
  switch (direction) {
    case Direction.Up:
      return cellAt(wrap(row - 1), column);
    case Direction.Down:
      return cellAt(wrap(row + 1), column);
    case Direction.Left:
      return cellAt(row, wrap(column - 1));
    case Direction.Right:
      return cellAt(row, wrap(column + 1));
  }
}

export function inputAction(cell: number, digit: Digit, asNote: boolean): GameAction {
  return asNote ? { type: ActionType.ToggleNote, cell, digit } : { type: ActionType.Place, cell, digit };
}

export interface CellView {
  value: Digit | null;
  notes: Digit[];
  given: boolean;
  selected: boolean;
  /** Shares a row, column or box with the selected cell. */
  peer: boolean;
  /** Holds the same digit as the selected cell. */
  sameDigit: boolean;
  conflict: boolean;
}

export function cellViews(state: GameState, selected: number | null): CellView[] {
  const conflicts = new Set(findConflictingCells(state.values));
  const peers = new Set(selected === null ? [] : PEERS[selected]);
  const selectedValue = selected === null ? EMPTY : state.values[selected];
  return Array.from({ length: CELL_COUNT }, (_, cell) => {
    const value = state.values[cell];
    return {
      value: value === EMPTY ? null : (value as Digit),
      notes: value === EMPTY ? candidateDigits(state.notes[cell]) : [],
      given: state.givens[cell] !== EMPTY,
      selected: cell === selected,
      peer: peers.has(cell),
      sameDigit: selectedValue !== EMPTY && value === selectedValue,
      conflict: conflicts.has(cell),
    };
  });
}
