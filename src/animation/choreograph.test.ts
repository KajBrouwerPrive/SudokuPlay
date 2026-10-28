import { describe, expect, it } from "vitest";
import { ActionType, AwardReason, BOXES, COLUMNS, GameEventType, RejectReason, ROWS, type GameEvent } from "../engine";
import {
  CARD_DELAY_MS,
  Control,
  DANCE_DELAY_MS,
  DANCE_STAGGER_MS,
  FINALE_CASCADE_MS,
  FINALE_DELAY_MS,
  LANDING_DELAY_MS,
  NOTE_STAGGER_MS,
  TargetKind,
  AWARD_STAGGER_MS,
  HINT_SPARKLE_LEAD_MS,
  WAVE_STAGGER_MS,
  choreograph,
  choreographAwards,
  distance,
  pointsLabel,
} from "./choreograph";
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

  it("sends a wave through a completed row, outward from the placed digit", () => {
    const cues = choreograph([
      { type: GameEventType.CellPlaced, cell: 4, digit: 1, correct: true },
      { type: GameEventType.UnitCompleted, unit: ROWS[0] },
    ]).filter((cue) => cue.effect === Effect.Wave);
    expect(cues.map((cue) => [cue.target, cue.delayMs])).toEqual(
      ROWS[0].cells.map((cell) => [{ kind: TargetKind.Cell, cell }, LANDING_DELAY_MS + WAVE_STAGGER_MS * Math.abs(cell - 4)]),
    );
  });

  it("waves each cell once when a move completes several units", () => {
    const cues = choreograph([
      { type: GameEventType.CellPlaced, cell: 0, digit: 1, correct: true },
      { type: GameEventType.UnitCompleted, unit: ROWS[0] },
      { type: GameEventType.UnitCompleted, unit: COLUMNS[0] },
      { type: GameEventType.UnitCompleted, unit: BOXES[0] },
    ]).filter((cue) => cue.effect === Effect.Wave);
    const cells = cues.map((cue) => (cue.target.kind === TargetKind.Cell ? cue.target.cell : -1));
    expect(new Set(cells).size).toBe(cells.length);
    // Row and column share only the placed cell; the box adds its four inner cells.
    expect(cells).toHaveLength(9 + 8 + 4);
  });

  it("starts a wave without a placement at the unit's first cell", () => {
    const [first] = choreograph([{ type: GameEventType.UnitCompleted, unit: BOXES[4] }]);
    expect(first).toMatchObject({ target: { kind: TargetKind.Cell, cell: BOXES[4].cells[0] }, delayMs: LANDING_DELAY_MS });
  });

  it("dances every copy of a completed digit in turn, then settles its pad button", () => {
    const cells = [2, 12, 22, 27, 37, 47, 60, 70, 80];
    const cues = choreograph([{ type: GameEventType.DigitCompleted, digit: 6, cells }]);
    expect(cues.map((cue) => [cue.effect, cue.target, cue.delayMs])).toEqual([
      ...cells.map((cell, turn) => [Effect.DigitDance, { kind: TargetKind.Cell, cell }, DANCE_DELAY_MS + DANCE_STAGGER_MS * turn]),
      [Effect.PadComplete, { kind: TargetKind.Pad, digit: 6 }, DANCE_DELAY_MS + DANCE_STAGGER_MS * cells.length],
    ]);
  });

  it("flips the solved board diagonal by diagonal, then throws confetti and shows the card", () => {
    const cues = choreograph([{ type: GameEventType.PuzzleSolved, mistakes: 0 }]);
    const flips = cues.filter((cue) => cue.effect === Effect.Flip);
    expect(flips).toHaveLength(81);
    expect(flips[0].delayMs).toBe(FINALE_DELAY_MS);
    expect(flips[80].delayMs).toBe(FINALE_CASCADE_MS);
    // Cells on one anti-diagonal flip together.
    expect(flips[1].delayMs).toBe(flips[9].delayMs);
    expect(cues.slice(81)).toEqual([
      { effect: Effect.Confetti, target: { kind: TargetKind.Board }, delayMs: FINALE_CASCADE_MS },
      { effect: Effect.CardIn, target: { kind: TargetKind.Control, control: Control.SolvedCard }, delayMs: CARD_DELAY_MS },
    ]);
  });

  it("keeps the celebrations in sequence: waves, then the digit dance, then the finale", () => {
    const longestWave = LANDING_DELAY_MS + WAVE_STAGGER_MS * 8;
    expect(DANCE_DELAY_MS).toBeGreaterThan(LANDING_DELAY_MS);
    expect(FINALE_DELAY_MS).toBeGreaterThan(DANCE_DELAY_MS + DANCE_STAGGER_MS * 9);
    expect(FINALE_DELAY_MS).toBeGreaterThan(longestWave);
  });

  it("twinkles stars on a hinted cell", () => {
    expect(choreograph([{ type: GameEventType.HintUsed, cell: 7, digit: 2, hints: 1 }])).toMatchObject([
      { effect: Effect.HintSparkle, target: { kind: TargetKind.Cell, cell: 7 }, delayMs: 0 },
    ]);
  });

  it("floats points up from their cell, bonuses above the counter in turn, and bumps the counter", () => {
    const cues = choreographAwards([
      { reason: AwardReason.Digit, points: 15, cell: 4 },
      { reason: AwardReason.Unit, points: 30, cell: null },
      { reason: AwardReason.DigitCompleted, points: 45, cell: null },
    ]);
    expect(cues.map((cue) => [cue.effect, cue.target, cue.delayMs, cue.label])).toEqual([
      [Effect.ScorePop, { kind: TargetKind.Cell, cell: 4 }, LANDING_DELAY_MS, "+15"],
      [Effect.ScorePop, { kind: TargetKind.Control, control: Control.Score }, LANDING_DELAY_MS, "+30"],
      [Effect.ScorePop, { kind: TargetKind.Control, control: Control.Score }, LANDING_DELAY_MS + AWARD_STAGGER_MS, "+45"],
      [Effect.ScoreBump, { kind: TargetKind.Control, control: Control.Score }, LANDING_DELAY_MS, undefined],
    ]);
  });

  it("shows a halving instead of a number for a hint, and squashes the counter", () => {
    const cues = choreographAwards([{ reason: AwardReason.Hint, points: -40, cell: 3 }]);
    expect(cues.map((cue) => [cue.effect, cue.label ?? null, cue.delayMs])).toEqual([
      [Effect.ScorePop, "÷2", LANDING_DELAY_MS],
      [Effect.ScoreHalve, null, HINT_SPARKLE_LEAD_MS],
    ]);
  });

  it("writes losses with a real minus sign", () => {
    expect(pointsLabel(15)).toBe("+15");
    expect(pointsLabel(-15)).toBe("−15");
  });

  it("measures distance in king steps", () => {
    expect(distance(0, 0)).toBe(0);
    expect(distance(0, 10)).toBe(1);
    expect(distance(0, 80)).toBe(8);
  });
});
