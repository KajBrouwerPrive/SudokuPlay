// UI session state around the engine game: selection, notes mode, the armed digit, score, play
// time and a log of engine events.
// A pure reducer, so React's StrictMode double-invocation is harmless and it is unit-testable.
import {
  ActionType,
  GameEventType,
  GameStatus,
  applyAction,
  createGame,
  createScore,
  isGiven,
  remainingByDigit,
  scoreEvents,
  type Award,
  type Digit,
  type GameAction,
  type GameEvent,
  type GameState,
  type Puzzle,
  type Score,
} from "../engine";
import type { GameOutcome, GameRecord } from "../stats/stats";
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
  /** The score changes these events caused. */
  awards: Award[];
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
  score: Score;
  /** Play time; only advances while the game is being played and the page is visible. */
  elapsedMs: number;
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
  /** Time passed while playing; the app sends it every second. */
  Tick: "tick",
} as const;

export type SessionAction =
  | { type: typeof SessionActionType.Select; cell: number }
  | { type: typeof SessionActionType.PressCell; cell: number; secondary: boolean }
  | { type: typeof SessionActionType.ArmDigit; digit: Digit }
  | { type: typeof SessionActionType.Command; command: Command }
  | { type: typeof SessionActionType.NewGame; puzzle: Puzzle }
  | { type: typeof SessionActionType.Tick; elapsedMs: number };

export function createSession(puzzle: Puzzle): Session {
  return {
    game: createGame(puzzle),
    selected: null,
    notesMode: false,
    armedDigit: null,
    score: createScore(),
    elapsedMs: 0,
    log: [],
    nextEventId: 1,
    lastBatch: null,
  };
}

function play(session: Session, action: GameAction): Session {
  const { state, events } = applyAction(session.game, action);
  if (events.length === 0) return state === session.game ? session : { ...session, game: state };
  const logged = events.map((event, index) => ({ id: session.nextEventId + index, event })).reverse();
  const { score, awards } = scoreEvents(session.score, events, { difficulty: state.difficulty, elapsedMs: session.elapsedMs });
  return {
    ...session,
    game: state,
    score,
    log: [...logged, ...session.log].slice(0, EVENT_LOG_LIMIT),
    nextEventId: session.nextEventId + events.length,
    lastBatch: { id: session.nextEventId, events, awards },
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

/** Fills a cell for the player and moves the selection there, so they see what changed. */
function hint(session: Session): Session {
  const next = play(session, { type: ActionType.Hint, preferredCell: session.selected });
  const used = next.lastBatch?.events.find((event) => event.type === GameEventType.HintUsed);
  return used && next !== session ? { ...next, selected: used.cell } : next;
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
    case CommandType.Hint:
      return hint(session);
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
    case SessionActionType.Tick:
      return session.game.status === GameStatus.Playing ? { ...session, elapsedMs: session.elapsedMs + action.elapsedMs } : session;
  }
}

/** Whether leaving this game now should count as a game played: a move was made and it is unsolved. */
export function isAbandonable(session: Session): boolean {
  return session.game.status === GameStatus.Playing && session.game.undoStack.length > 0;
}

export function toGameRecord(session: Session, outcome: GameOutcome, finishedAt: Date): GameRecord {
  const { game, score, elapsedMs } = session;
  return {
    finishedAt: finishedAt.toISOString(),
    difficulty: game.difficulty,
    seed: game.seed,
    points: score.points,
    mistakes: game.mistakes,
    hints: game.hints,
    durationMs: Math.round(elapsedMs),
    outcome,
  };
}
