import { describe, expect, it } from "vitest";
import { ActionType, GameEventType, RejectReason, ROWS, type GameEvent } from "../engine";
import { Control, LANDING_DELAY_MS, NOTE_STAGGER_MS, TargetKind, choreograph, distance } from "./choreograph";
import { Effect } from "./effects";

const effects = (events: GameEvent[]) => choreograph(events).map((cue) => cue.effect);

describe("choreograph", () => {
  it("plops a correct digit with a ring and a pad hop, all at once", () => {
    const cues = choreograph([{ type: GameEventType.CellPlaced, cell: 40, digit: 7, correct: true }]);
    expect(cues).toEqual([
      { effect: Effect.Plop, target: { kind: TargetKind.Cell, cell: 40 }, delayMs: 0 },
      { effect: Effect.Ring, target: { kind: TargetKind.Cell, cell: 40 }, delayMs: 0 },
      { effect: Effect.PadHop, target: { kind: TargetKind.Pad, digit: 7 }, delayMs: 0 },
    ]);
  });

  it("gives a wrong digit a limp plop, then wobbles every clashing cell and shakes the counter after landing", () => {
    const cues = choreograph([
      { type: GameEventType.CellPlaced, cell: 2, digit: 5, correct: false },
      { type: GameEventType.ConflictDetected, cell: 2, digit: 5, conflictingCells: [0] },
      { type: GameEventType.MistakeMade, cell: 2, digit: 5, mistakes: 1 },
    ]);
    expect(cues.map((cue) => [cue.effect, cue.target, cue.delayMs])).toEqual([
      [Effect.PlopWeak, { kind: TargetKind.Cell, cell: 2 }, 0],
      [Effect.Wobble, { kind: TargetKind.Cell, cell: 2 }, LANDING_DELAY_MS],
      [Effect.ConflictPulse, { kind: TargetKind.Cell, cell: 2 }, LANDING_DELAY_MS],
      [Effect.Wobble, { kind: TargetKind.Cell, cell: 0 }, LANDING_DELAY_MS],
      [Effect.ConflictPulse, { kind: TargetKind.Cell, cell: 0 }, LANDING_DELAY_MS],
      [Effect.CounterShake, { kind: TargetKind.Control, control: Control.Mistakes }, LANDING_DELAY_MS],
    ]);
  });

  it("blows notes away nearest first, after the digit lands", () => {
    // From cell 0: cell 1 is 1 step away, cell 4 is 4 steps, cell 8 is 8 steps.
    const cues = choreograph([
      { type: GameEventType.CellPlaced, cell: 0, digit: 3, correct: true },
      { type: GameEventType.NotesCleared, digit: 3, cells: [8, 1, 4] },
    ]).filter((cue) => cue.effect === Effect.NoteBlowAway);
    expect(cues.map((cue) => [cue.target, cue.delayMs, cue.label])).toEqual([
      [{ kind: TargetKind.Note, cell: 8, digit: 3 }, LANDING_DELAY_MS + 7 * NOTE_STAGGER_MS, "3"],
      [{ kind: TargetKind.Note, cell: 1, digit: 3 }, LANDING_DELAY_MS, "3"],
      [{ kind: TargetKind.Note, cell: 4, digit: 3 }, LANDING_DELAY_MS + 3 * NOTE_STAGGER_MS, "3"],
    ]);
  });

  it("pops notes in and out, the removed one as a ghost", () => {
    expect(choreograph([{ type: GameEventType.NoteToggled, cell: 5, digit: 2, added: true }])[0].effect).toBe(Effect.NotePopIn);
    expect(choreograph([{ type: GameEventType.NoteToggled, cell: 5, digit: 2, added: false }])[0]).toMatchObject({ effect: Effect.NotePopOut, label: "2" });
  });

  it("drops an erased digit out as a ghost, and sweeps a cell whose notes were erased", () => {
    expect(choreograph([{ type: GameEventType.CellErased, cell: 5, digit: 9 }])).toEqual([
      { effect: Effect.DropOut, target: { kind: TargetKind.Cell, cell: 5 }, delayMs: 0, label: "9" },
    ]);
    expect(effects([{ type: GameEventType.CellErased, cell: 5, digit: null }])).toEqual([Effect.CellSweep]);
  });

  it("spins changed cells backwards on undo and forwards on redo", () => {
    expect(effects([{ type: GameEventType.MoveUndone, changedCells: [2, 3] }])).toEqual([Effect.RewindBackward, Effect.RewindBackward]);
    expect(effects([{ type: GameEventType.MoveRedone, changedCells: [2] }])).toEqual([Effect.RewindForward]);
  });

  it("bonks locked cells and wiggles the button that cannot act", () => {
    const place = { type: ActionType.Place, cell: 0, digit: 1 } as const;
    expect(effects([{ type: GameEventType.MoveRejected, action: place, reason: RejectReason.GivenCell, cell: 0 }])).toEqual([Effect.Bonk]);
    expect(choreograph([{ type: GameEventType.MoveRejected, action: { type: ActionType.Redo }, reason: RejectReason.NothingToRedo, cell: null }])[0]).toMatchObject({
      effect: Effect.Wiggle,
      target: { kind: TargetKind.Control, control: Control.Redo },
    });
    expect(choreograph([{ type: GameEventType.MoveRejected, action: place, reason: RejectReason.GameOver, cell: 0 }])).toEqual([]);
  });

  it("has no cues yet for celebrations", () => {
    expect(
      choreograph([
        { type: GameEventType.UnitCompleted, unit: ROWS[0] },
        { type: GameEventType.DigitCompleted, digit: 1 },
        { type: GameEventType.PuzzleSolved, mistakes: 0 },
      ]),
    ).toEqual([]);
  });

  it("measures distance in king steps", () => {
    expect(distance(0, 0)).toBe(0);
    expect(distance(0, 10)).toBe(1);
    expect(distance(0, 80)).toBe(8);
  });
});
