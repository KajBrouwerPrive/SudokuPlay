// The director: turns one transition's engine events into timed animation cues. Pure, so timing
// and order are unit-tested; the cue player only executes what this returns.
import { GameEventType, RejectReason, columnOf, rowOf, type Digit, type GameEvent } from "../engine";
import { Effect } from "./effects";

export const Control = {
  Mistakes: "mistakes",
  Undo: "undo",
  Redo: "redo",
} as const;
export type Control = (typeof Control)[keyof typeof Control];

export const TargetKind = {
  Cell: "cell",
  Note: "note",
  Pad: "pad",
  Control: "control",
} as const;

export type CueTarget =
  | { kind: typeof TargetKind.Cell; cell: number }
  | { kind: typeof TargetKind.Note; cell: number; digit: Digit }
  | { kind: typeof TargetKind.Pad; digit: Digit }
  | { kind: typeof TargetKind.Control; control: Control };

export interface Cue {
  effect: Effect;
  target: CueTarget;
  delayMs: number;
  /** Text for ghost copies (an erased digit or a removed note). */
  label?: string;
}

/** Reactions to a placement start once the digit has visibly landed. */
export const LANDING_DELAY_MS = 140;
/** Removed notes leave one ring of distance at a time, nearest first. */
export const NOTE_STAGGER_MS = 35;

const cellTarget = (cell: number): CueTarget => ({ kind: TargetKind.Cell, cell });
const controlTarget = (control: Control): CueTarget => ({ kind: TargetKind.Control, control });

/** Steps between two cells when moving like a king; peers in the same box are 1 or 2 apart. */
export function distance(from: number, to: number): number {
  return Math.max(Math.abs(rowOf(from) - rowOf(to)), Math.abs(columnOf(from) - columnOf(to)));
}

function cuesFor(event: GameEvent, placedCell: number | null): Cue[] {
  switch (event.type) {
    case GameEventType.CellPlaced:
      return event.correct
        ? [
            { effect: Effect.Plop, target: cellTarget(event.cell), delayMs: 0 },
            { effect: Effect.Ring, target: cellTarget(event.cell), delayMs: 0 },
            { effect: Effect.PadHop, target: { kind: TargetKind.Pad, digit: event.digit }, delayMs: 0 },
          ]
        : [{ effect: Effect.PlopWeak, target: cellTarget(event.cell), delayMs: 0 }];
    case GameEventType.NotesCleared:
      return event.cells.map((cell) => ({
        effect: Effect.NoteBlowAway,
        target: { kind: TargetKind.Note, cell, digit: event.digit },
        delayMs: LANDING_DELAY_MS + NOTE_STAGGER_MS * (placedCell === null ? 0 : distance(placedCell, cell) - 1),
        label: String(event.digit),
      }));
    case GameEventType.ConflictDetected:
      return [event.cell, ...event.conflictingCells].flatMap((cell) => [
        { effect: Effect.Wobble, target: cellTarget(cell), delayMs: LANDING_DELAY_MS },
        { effect: Effect.ConflictPulse, target: cellTarget(cell), delayMs: LANDING_DELAY_MS },
      ]);
    case GameEventType.MistakeMade:
      return [{ effect: Effect.CounterShake, target: controlTarget(Control.Mistakes), delayMs: LANDING_DELAY_MS }];
    case GameEventType.NoteToggled:
      return event.added
        ? [{ effect: Effect.NotePopIn, target: { kind: TargetKind.Note, cell: event.cell, digit: event.digit }, delayMs: 0 }]
        : [{ effect: Effect.NotePopOut, target: { kind: TargetKind.Note, cell: event.cell, digit: event.digit }, delayMs: 0, label: String(event.digit) }];
    case GameEventType.CellErased:
      return event.digit === null
        ? [{ effect: Effect.CellSweep, target: cellTarget(event.cell), delayMs: 0 }]
        : [{ effect: Effect.DropOut, target: cellTarget(event.cell), delayMs: 0, label: String(event.digit) }];
    case GameEventType.MoveUndone:
      return event.changedCells.map((cell) => ({ effect: Effect.RewindBackward, target: cellTarget(cell), delayMs: 0 }));
    case GameEventType.MoveRedone:
      return event.changedCells.map((cell) => ({ effect: Effect.RewindForward, target: cellTarget(cell), delayMs: 0 }));
    case GameEventType.MoveRejected:
      switch (event.reason) {
        case RejectReason.GivenCell:
        case RejectReason.CellFilled:
          return event.cell === null ? [] : [{ effect: Effect.Bonk, target: cellTarget(event.cell), delayMs: 0 }];
        case RejectReason.NothingToUndo:
          return [{ effect: Effect.Wiggle, target: controlTarget(Control.Undo), delayMs: 0 }];
        case RejectReason.NothingToRedo:
          return [{ effect: Effect.Wiggle, target: controlTarget(Control.Redo), delayMs: 0 }];
        case RejectReason.GameOver:
          return [];
      }
      return [];
    // Celebrations (waves, digit dance, finale) arrive in the next step of phase 5.
    case GameEventType.UnitCompleted:
    case GameEventType.DigitCompleted:
    case GameEventType.PuzzleSolved:
      return [];
  }
}

export function choreograph(events: readonly GameEvent[]): Cue[] {
  let placedCell: number | null = null;
  return events.flatMap((event) => {
    if (event.type === GameEventType.CellPlaced) placedCell = event.cell;
    return cuesFor(event, placedCell);
  });
}
