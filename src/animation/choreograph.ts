// The director: turns one transition's engine events into timed animation cues. Pure, so timing
// and order are unit-tested; the cue player only executes what this returns.
import { CELL_COUNT, GRID_SIZE, GameEventType, RejectReason, columnOf, rowOf, type Digit, type GameEvent } from "../engine";
import { Effect } from "./effects";

export const Control = {
  Mistakes: "mistakes",
  Undo: "undo",
  Redo: "redo",
  SolvedCard: "solvedCard",
} as const;
export type Control = (typeof Control)[keyof typeof Control];

export const TargetKind = {
  Cell: "cell",
  Note: "note",
  Pad: "pad",
  Control: "control",
  Board: "board",
} as const;

export type CueTarget =
  | { kind: typeof TargetKind.Cell; cell: number }
  | { kind: typeof TargetKind.Note; cell: number; digit: Digit }
  | { kind: typeof TargetKind.Pad; digit: Digit }
  | { kind: typeof TargetKind.Control; control: Control }
  | { kind: typeof TargetKind.Board };

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
/** A completion wave travels one cell further from the placed digit every this many ms. */
export const WAVE_STAGGER_MS = 40;
/** The digit dance starts once the waves are well under way; one copy hops at a time. */
export const DANCE_DELAY_MS = 420;
export const DANCE_STAGGER_MS = 70;
/** The finale waits for the digit dance, which the last placement always triggers. */
export const FINALE_DELAY_MS = 1100;
/** The flip cascade runs one diagonal (row + column) at a time, from the top left. */
export const FLIP_STAGGER_MS = 35;
/** The last diagonal starts flipping after this, which is when confetti and the card follow. */
export const FINALE_CASCADE_MS = FINALE_DELAY_MS + 2 * (GRID_SIZE - 1) * FLIP_STAGGER_MS;
export const CARD_DELAY_MS = FINALE_CASCADE_MS + 200;

const cellTarget = (cell: number): CueTarget => ({ kind: TargetKind.Cell, cell });
const controlTarget = (control: Control): CueTarget => ({ kind: TargetKind.Control, control });

/** Steps between two cells when moving like a king; peers in the same box are 1 or 2 apart. */
export function distance(from: number, to: number): number {
  return Math.max(Math.abs(rowOf(from) - rowOf(to)), Math.abs(columnOf(from) - columnOf(to)));
}

/** What earlier events in the same batch tell later ones. */
interface BatchContext {
  placedCell: number | null;
  /** Cells already in a wave; the placed cell belongs to every completed unit but should hop once. */
  wavedCells: Set<number>;
}

function cuesFor(event: GameEvent, { placedCell, wavedCells }: BatchContext): Cue[] {
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
    case GameEventType.UnitCompleted: {
      const origin = placedCell ?? event.unit.cells[0];
      return event.unit.cells
        .filter((cell) => !wavedCells.has(cell))
        .map((cell) => {
          wavedCells.add(cell);
          return { effect: Effect.Wave, target: cellTarget(cell), delayMs: LANDING_DELAY_MS + WAVE_STAGGER_MS * distance(origin, cell) };
        });
    }
    case GameEventType.DigitCompleted:
      return [
        ...event.cells.map((cell, turn) => ({ effect: Effect.DigitDance, target: cellTarget(cell), delayMs: DANCE_DELAY_MS + DANCE_STAGGER_MS * turn })),
        { effect: Effect.PadComplete, target: { kind: TargetKind.Pad, digit: event.digit }, delayMs: DANCE_DELAY_MS + DANCE_STAGGER_MS * event.cells.length },
      ];
    case GameEventType.PuzzleSolved:
      return [
        ...Array.from({ length: CELL_COUNT }, (_, cell) => ({
          effect: Effect.Flip,
          target: cellTarget(cell),
          delayMs: FINALE_DELAY_MS + FLIP_STAGGER_MS * (rowOf(cell) + columnOf(cell)),
        })),
        { effect: Effect.Confetti, target: { kind: TargetKind.Board }, delayMs: FINALE_CASCADE_MS },
        { effect: Effect.CardIn, target: controlTarget(Control.SolvedCard), delayMs: CARD_DELAY_MS },
      ];
  }
}

export function choreograph(events: readonly GameEvent[]): Cue[] {
  const context: BatchContext = { placedCell: null, wavedCells: new Set() };
  return events.flatMap((event) => {
    if (event.type === GameEventType.CellPlaced) context.placedCell = event.cell;
    return cuesFor(event, context);
  });
}
