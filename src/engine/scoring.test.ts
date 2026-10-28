import { describe, expect, it } from "vitest";
import { GameEventType, type GameEvent } from "./game";
import { Difficulty } from "./grader";
import { ROWS, type Digit } from "./grid";
import {
  AwardReason,
  BASE_POINTS,
  DIGIT_BONUS,
  FLAWLESS_BONUS,
  MAX_MULTIPLIER,
  MAX_SPEED_BONUS,
  SOLVE_BONUS,
  TARGET_TIME_MS,
  UNIT_BONUS,
  createScore,
  multiplierFor,
  scoreEvents,
  speedBonus,
  type Score,
  type ScoreContext,
} from "./scoring";

const CONTEXT: ScoreContext = { difficulty: Difficulty.Medium, elapsedMs: TARGET_TIME_MS[Difficulty.Medium] };
const BASE = BASE_POINTS[Difficulty.Medium];

const correct = (cell: number, digit: Digit = 1): GameEvent => ({ type: GameEventType.CellPlaced, cell, digit, correct: true });
const wrong = (cell: number): GameEvent[] => [
  { type: GameEventType.CellPlaced, cell, digit: 2, correct: false },
  { type: GameEventType.MistakeMade, cell, digit: 2, mistakes: 1 },
];

function run(score: Score, ...batches: GameEvent[][]): Score {
  for (const events of batches) score = scoreEvents(score, events, CONTEXT).score;
  return score;
}

describe("scoring", () => {
  it("pays the base for a first correct digit and grows the combo", () => {
    const { score, awards } = scoreEvents(createScore(), [correct(0)], CONTEXT);
    expect(awards).toEqual([{ reason: AwardReason.Digit, points: BASE, cell: 0 }]);
    expect(score).toMatchObject({ points: BASE, combo: 1 });
    expect(scoreEvents(score, [correct(1)], CONTEXT).awards[0].points).toBe(Math.round(BASE * 1.1));
  });

  it("caps the combo multiplier", () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(5)).toBeCloseTo(1.5);
    expect(multiplierFor(100)).toBe(MAX_MULTIPLIER);
  });

  it("pays every cell only once, so undo and replay cannot farm points", () => {
    const once = run(createScore(), [correct(0)]);
    const again = scoreEvents(once, [correct(0)], CONTEXT);
    expect(again.awards).toEqual([]);
    expect(again.score.combo).toBe(1);
  });

  it("takes the base for a mistake, never below zero, and resets the combo", () => {
    const before = run(createScore(), [correct(0)], [correct(1)]);
    const { score, awards } = scoreEvents(before, wrong(2), CONTEXT);
    expect(awards).toEqual([{ reason: AwardReason.Mistake, points: -BASE, cell: 2 }]);
    expect(score.combo).toBe(0);
    expect(scoreEvents(createScore(), wrong(2), CONTEXT).score.points).toBe(0);
  });

  it("halves the points on a hint, and the hinted digit earns nothing", () => {
    const before = { ...createScore(), points: 101, combo: 4 };
    const { score, awards } = scoreEvents(before, [{ type: GameEventType.HintUsed, cell: 5, digit: 3, hints: 1 }, correct(5, 3)], CONTEXT);
    expect(awards).toEqual([{ reason: AwardReason.Hint, points: -51, cell: 5 }]);
    expect(score).toMatchObject({ points: 50, combo: 0, hints: 1 });
    // The hinted cell never pays out later either.
    expect(scoreEvents(score, [correct(5, 3)], CONTEXT).awards).toEqual([]);
  });

  it("pays unit and digit bonuses once each", () => {
    const unit: GameEvent = { type: GameEventType.UnitCompleted, unit: ROWS[0] };
    const digit: GameEvent = { type: GameEventType.DigitCompleted, digit: 4, cells: [] };
    const { score, awards } = scoreEvents(createScore(), [unit, digit], CONTEXT);
    expect(awards.map(({ reason, points }) => [reason, points])).toEqual([
      [AwardReason.Unit, BASE * UNIT_BONUS],
      [AwardReason.DigitCompleted, BASE * DIGIT_BONUS],
    ]);
    expect(scoreEvents(score, [unit, digit], CONTEXT).awards).toEqual([]);
  });

  it("adds solve, flawless and speed bonuses at the end", () => {
    const fast = { ...CONTEXT, elapsedMs: TARGET_TIME_MS[Difficulty.Medium] / 2 };
    const { awards } = scoreEvents(createScore(), [{ type: GameEventType.PuzzleSolved, mistakes: 0 }], fast);
    expect(awards.map(({ reason, points }) => [reason, points])).toEqual([
      [AwardReason.Solve, BASE * SOLVE_BONUS],
      [AwardReason.Flawless, BASE * FLAWLESS_BONUS],
      [AwardReason.Speed, (BASE * MAX_SPEED_BONUS) / 2],
    ]);
  });

  it("skips the flawless bonus after a mistake or a hint", () => {
    const solvedWithMistake = scoreEvents(createScore(), [{ type: GameEventType.PuzzleSolved, mistakes: 1 }], CONTEXT);
    expect(solvedWithMistake.awards.map((award) => award.reason)).toEqual([AwardReason.Solve]);
    const hinted = { ...createScore(), hints: 1 };
    expect(scoreEvents(hinted, [{ type: GameEventType.PuzzleSolved, mistakes: 0 }], CONTEXT).awards.map((award) => award.reason)).toEqual([AwardReason.Solve]);
  });

  it("gives no speed bonus at or after the target time", () => {
    expect(speedBonus(CONTEXT)).toBe(0);
    expect(speedBonus({ ...CONTEXT, elapsedMs: CONTEXT.elapsedMs * 3 })).toBe(0);
    expect(speedBonus({ ...CONTEXT, elapsedMs: 0 })).toBe(BASE * MAX_SPEED_BONUS);
  });
});
