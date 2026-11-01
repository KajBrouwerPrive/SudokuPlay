// UI session state around the engine game: selection, notes mode, the armed digit and a log of engine events.
// A pure reducer, so React's StrictMode double-invocation is harmless and it is unit-testable.
import { ActionType, applyAction, createGame, isGiven, remainingByDigit, type Digit, type GameAction, type GameEvent, type GameState, type Puzzle } from "../engine";
import { CommandType, inputAction, moveSelection, type Command } from "./controls";

/** Events kept for the on-screen log; enough to follow a few moves back. */
export const EVENT_LOG_LIMIT = 40;
/** Where the keyboard cursor starts when nothing is selected yet. */
const CENTER_CELL = 40;

export interface LoggedEvent {
  id: number;
  event: GameEvent;
}

/** The events of one transition, which the animation layer plays together. */
export interface EventBatch {
  /** The id of the batch's first event, so every batch has its own id. */
  id: number;
  events: GameEvent[];
}

export interface Session {
  game: GameState;
  selected: number | null;
  notesMode: boolean;
  /**
   * The digit picked on the number pad, if any. A left click on a cell places it (or notes it in
   * notes mode); a right click always notes it.
   */
  armedDigit: Digit | null;
  /** Newest first. */
  log: LoggedEvent[];
  nextEventId: number;
  /** The latest transition that produced events. */
  lastBatch: EventBatch | null;
}

export const SessionActionType = {
  Select: "select",
  /** A click on a cell: selects it and applies the armed digit. `secondary` is the right button. */
  PressCell: "pressCell",
  /** A click on a pad digit: arms it, or disarms it when it was already armed. */
  ArmDigit: "armDigit",
  Command: "command",
  NewGame: "newGame",
} as const;

export type SessionAction =
  | { type: typeof SessionActionType.Select; cell: number }
  | { type: typeof SessionActionType.PressCell; cell: number; secondary: boolean }
  | { type: typeof SessionActionType.ArmDigit; digit: Digit }
  | { type: typeof SessionActionType.Command; command: Command }
  | { type: typeof SessionActionType.NewGame; puzzle: Puzzle };

export function createSession(puzzle: Puzzle): Session {
  return { game: createGame(puzzle), selected: null, notesMode: false, armedDigit: null, log: [], nextEventId: 1, lastBatch: null };
}

function play(session: Session, action: GameAction): Session {
  const { state, events } = applyAction(session.game, action);
  if (events.length === 0) return state === session.game ? session : { ...session, game: state };
  const logged = events.map((event, index) => ({ id: session.nextEventId + index, event })).reverse();
  return {
    ...session,
    game: state,
    log: [...logged, ...session.log].slice(0, EVENT_LOG_LIMIT),
    nextEventId: session.nextEventId + events.length,
    lastBatch: { id: session.nextEventId, events },
  };
}

/** A digit with all nine copies placed cannot be used any more, so it lets go. */
function releaseIfDone(session: Session): Session {
  const { armedDigit } = session;
  return armedDigit !== null && remainingByDigit(session.game)[armedDigit] === 0 ? { ...session, armedDigit: null } : session;
}

function pressCell(session: Session, cell: number, secondary: boolean): Session {
  const selected = { ...session, selected: cell };
  // Givens only get selected, so clicking around with an armed digit does not bonk on every one.
  if (session.armedDigit === null || isGiven(session.game, cell)) return selected;
  return releaseIfDone(play(selected, inputAction(cell, session.armedDigit, secondary || session.notesMode)));
}

function runCommand(session: Session, command: Command): Session {
  switch (command.type) {
    case CommandType.ToggleNotesMode:
      return { ...session, notesMode: !session.notesMode };
    case CommandType.Disarm:
      return { ...session, armedDigit: null };
    case CommandType.Move:
      return { ...session, selected: moveSelection(session.selected ?? CENTER_CELL, command.direction) };
    case CommandType.Undo:
      return play(session, { type: ActionType.Undo });
    case CommandType.Redo:
      return play(session, { type: ActionType.Redo });
    case CommandType.Erase:
      return session.selected === null ? session : play(session, { type: ActionType.Erase, cell: session.selected });
    case CommandType.Input:
      return session.selected === null ? session : play(session, inputAction(session.selected, command.digit, command.asNote));
  }
}

export function sessionReducer(session: Session, action: SessionAction): Session {
  switch (action.type) {
    case SessionActionType.Select:
      return { ...session, selected: action.cell };
    case SessionActionType.PressCell:
      return pressCell(session, action.cell, action.secondary);
    case SessionActionType.ArmDigit:
      return { ...session, armedDigit: session.armedDigit === action.digit ? null : action.digit };
    case SessionActionType.Command:
      return releaseIfDone(runCommand(session, action.command));
    case SessionActionType.NewGame:
      return { ...createSession(action.puzzle), notesMode: session.notesMode };
  }
}
