// UI session state around the engine game: selection, notes mode and a log of engine events.
// A pure reducer, so React's StrictMode double-invocation is harmless and it is unit-testable.
import { ActionType, applyAction, createGame, type GameAction, type GameEvent, type GameState, type Puzzle } from "../engine";
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
  /** Newest first. */
  log: LoggedEvent[];
  nextEventId: number;
  /** The latest transition that produced events. */
  lastBatch: EventBatch | null;
}

export const SessionActionType = {
  Select: "select",
  Command: "command",
  NewGame: "newGame",
} as const;

export type SessionAction =
  | { type: typeof SessionActionType.Select; cell: number }
  | { type: typeof SessionActionType.Command; command: Command }
  | { type: typeof SessionActionType.NewGame; puzzle: Puzzle };

export function createSession(puzzle: Puzzle): Session {
  return { game: createGame(puzzle), selected: null, notesMode: false, log: [], nextEventId: 1, lastBatch: null };
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

function runCommand(session: Session, command: Command): Session {
  switch (command.type) {
    case CommandType.ToggleNotesMode:
      return { ...session, notesMode: !session.notesMode };
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
    case SessionActionType.Command:
      return runCommand(session, action.command);
    case SessionActionType.NewGame:
      return { ...createSession(action.puzzle), notesMode: session.notesMode };
  }
}
