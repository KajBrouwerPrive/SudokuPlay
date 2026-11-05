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
  MAX_NOTES_BONUS,
  MAX_MISTAKE_PENALTY,
  MAX_SPEED_BONUS,
  MISTAKE_PENALTY_STEP,
  NOTES_BUDGET_PER_CELL,
  REFERENCE_OPEN_CELLS,
  SOLVE_BONUS,
  SPEED_HALF_LIFE_MS,
  SPEED_TOP_TIME_MS,
  UNIT_BONUS,
  createScore,
  mistakePenalty,
  multiplierFor,
  notesBonus,
  scoreBreakdown,
  scoreEvents,
  speedBonus,
  type Score,
  type ScoreContext,
} from "./scoring";

/** So slow that the speed bonus rounds to zero, which keeps it out of the way of other tests. */
const SLOW_MS = 60 * 60_000;
const TOP_MS = SPEED_TOP_TIME_MS[Difficulty.Medium];
const HALF_LIFE_MS = SPEED_HALF_LIFE_MS[Difficulty.Medium];

const CONTEXT: ScoreContext = {
  difficulty: Difficulty.Medium,
  elapsedMs: SLOW_MS,
  openCells: REFERENCE_OPEN_CELLS,
};
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
    expect(multiplierFor(0, REFERENCE_OPEN_CELLS)).toBe(1);
    expect(multiplierFor(5, REFERENCE_OPEN_CELLS)).toBeCloseTo(1.5);
    expect(multiplierFor(100, REFERENCE_OPEN_CELLS)).toBe(MAX_MULTIPLIER);
  });

  it("climbs the combo slower on a puzzle with more open cells", () => {
    expect(multiplierFor(10, REFERENCE_OPEN_CELLS * 2)).toBeCloseTo(1.5);
  });

  it("pays every cell only once, so undo and replay cannot farm points", () => {
    const once = run(createScore(), [correct(0)]);
    const again = scoreEvents(once, [correct(0)], CONTEXT);
    expect(again.awards).toEqual([]);
    expect(again.score.combo).toBe(1);
  });

  it("makes every mistake cost more, up to a maximum, and resets the combo", () => {
    const before = run(createScore(), [correct(0)], [correct(1)]);
    const { score, awards } = scoreEvents(before, wrong(2), CONTEXT);
    expect(awards).toEqual([{ reason: AwardReason.Mistake, points: -MISTAKE_PENALTY_STEP * BASE, cell: 2 }]);
    expect(score).toMatchObject({ combo: 0, mistakes: 1 });
    expect(scoreEvents(score, wrong(3), CONTEXT).awards[0].points).toBe(-2 * MISTAKE_PENALTY_STEP * BASE);
    expect(mistakePenalty(10, Difficulty.Medium)).toBe(MAX_MISTAKE_PENALTY * BASE);
  });

  it("lets an early mistake push the points below zero, so it is never free", () => {
    expect(scoreEvents(createScore(), wrong(2), CONTEXT).score.points).toBe(-MISTAKE_PENALTY_STEP * BASE);
  });

  it("weighs one mistake heavier than the whole speed bonus", () => {
    const lostByOneMistake = mistakePenalty(1, Difficulty.Medium) + FLAWLESS_BONUS * BASE;
    expect(lostByOneMistake).toBeGreaterThan(MAX_SPEED_BONUS * BASE);
  });

  it("ranks flawless over speed over notes", () => {
    expect(FLAWLESS_BONUS).toBeGreaterThan(MAX_SPEED_BONUS);
    expect(MAX_SPEED_BONUS).toBeGreaterThan(MAX_NOTES_BONUS);
  });

  it("makes how well a puzzle is solved worth more than filling the grid", () => {
    // Every digit at the maximum multiplier, every unit, every digit and the solve itself.
    const gridPoints = REFERENCE_OPEN_CELLS * MAX_MULTIPLIER + ROWS.length * 3 * UNIT_BONUS + 9 * DIGIT_BONUS + SOLVE_BONUS;
    expect(FLAWLESS_BONUS + MAX_SPEED_BONUS + MAX_NOTES_BONUS).toBeGreaterThan(gridPoints);
  });

  it("does not halve a score that is zero or below", () => {
    const negative = { ...createScore(), points: -80 };
    const { score, awards } = scoreEvents(negative, [{ type: GameEventType.HintUsed, cell: 5, digit: 3, hints: 1 }], CONTEXT);
    expect(awards).toEqual([]);
    expect(score).toMatchObject({ points: -80, hints: 1 });
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
    const oneHalfLife = { ...CONTEXT, elapsedMs: TOP_MS + HALF_LIFE_MS };
    const { awards } = scoreEvents(createScore(), [{ type: GameEventType.PuzzleSolved, mistakes: 0 }], oneHalfLife);
    expect(awards.map(({ reason, points }) => [reason, points])).toEqual([
      [AwardReason.Solve, BASE * SOLVE_BONUS],
      [AwardReason.Flawless, BASE * FLAWLESS_BONUS],
      [AwardReason.Speed, Math.round((BASE * MAX_SPEED_BONUS) / 2)],
      [AwardReason.Notes, BASE * MAX_NOTES_BONUS],
    ]);
  });

  it("skips the flawless bonus after a mistake or a hint", () => {
    const solvedWithMistake = scoreEvents(createScore(), [{ type: GameEventType.PuzzleSolved, mistakes: 1 }], CONTEXT);
    expect(solvedWithMistake.awards.map((award) => award.reason)).toEqual([AwardReason.Solve, AwardReason.Notes]);
    const hinted = { ...createScore(), hints: 1 };
    expect(scoreEvents(hinted, [{ type: GameEventType.PuzzleSolved, mistakes: 0 }], CONTEXT).awards.map((award) => award.reason)).toEqual([AwardReason.Solve, AwardReason.Notes]);
  });

  it("pays every puzzle of a level about the same for the same clean play, however many cells it leaves open", () => {
    const digitTotal = (difficulty: Difficulty, openCells: number) => {
      const context = { ...CONTEXT, difficulty, openCells };
      let score = createScore();
      for (let cell = 0; cell < openCells; cell++) score = scoreEvents(score, [correct(cell)], context).score;
      return score.points;
    };
    for (const difficulty of Object.values(Difficulty)) {
      const reference = digitTotal(difficulty, REFERENCE_OPEN_CELLS);
      // Only the combo climbing in whole digits remains: less than one plain digit is worth.
      for (let openCells = 35; openCells <= 64; openCells++) {
        expect(Math.abs(digitTotal(difficulty, openCells) - reference)).toBeLessThan(BASE_POINTS[difficulty]);
      }
    }
  });

  describe("speed bonus", () => {
    const bonusAt = (elapsedMs: number) => speedBonus({ ...CONTEXT, elapsedMs });

    it("pays the full bonus up to the top time, and nothing extra for going faster", () => {
      expect(bonusAt(0)).toBe(BASE * MAX_SPEED_BONUS);
      expect(bonusAt(TOP_MS)).toBe(BASE * MAX_SPEED_BONUS);
    });

    it("halves with every half-life slower than the top time", () => {
      expect(bonusAt(TOP_MS + HALF_LIFE_MS)).toBe(Math.round((BASE * MAX_SPEED_BONUS) / 2));
      expect(bonusAt(TOP_MS + 2 * HALF_LIFE_MS)).toBe(Math.round((BASE * MAX_SPEED_BONUS) / 4));
    });

    it("makes a faster solve worth more, and a second saved worth more the faster the solve", () => {
      const stepMs = 15_000;
      let previousGain = Infinity;
      for (let elapsedMs = TOP_MS; elapsedMs <= TOP_MS + 3 * HALF_LIFE_MS; elapsedMs += stepMs) {
        const gain = bonusAt(elapsedMs) - bonusAt(elapsedMs + stepMs);
        expect(gain).toBeGreaterThan(0);
        // Rounding to whole points can make two neighbouring steps differ by one.
        expect(gain).toBeLessThanOrEqual(previousGain + 1);
        previousGain = gain;
      }
      expect(bonusAt(TOP_MS) - bonusAt(TOP_MS + stepMs)).toBeGreaterThan(2 * (bonusAt(TOP_MS + 2 * HALF_LIFE_MS) - bonusAt(TOP_MS + 2 * HALF_LIFE_MS + stepMs)));
    });

    it("keeps a little bonus past the old target times, fading to zero for very slow solves", () => {
      expect(bonusAt(15 * 60_000)).toBeGreaterThan(0);
      expect(bonusAt(SLOW_MS)).toBe(0);
    });

    it("sets the top time and half-life to grow with the level", () => {
      const levels = Object.values(Difficulty);
      for (let index = 1; index < levels.length; index++) {
        expect(SPEED_TOP_TIME_MS[levels[index]]).toBeGreaterThan(SPEED_TOP_TIME_MS[levels[index - 1]]);
        expect(SPEED_HALF_LIFE_MS[levels[index]]).toBeGreaterThan(SPEED_HALF_LIFE_MS[levels[index - 1]]);
      }
    });
  });

  describe("notes bonus", () => {
    const note = (cell: number, digit: Digit, added = true): GameEvent => ({ type: GameEventType.NoteToggled, cell, digit, added });
    const solved: GameEvent = { type: GameEventType.PuzzleSolved, mistakes: 0 };
    const notesAward = (score: Score) => scoreEvents(score, [solved], CONTEXT).awards.find((award) => award.reason === AwardReason.Notes)?.points ?? 0;
    const budget = NOTES_BUDGET_PER_CELL * REFERENCE_OPEN_CELLS;

    it("pays the full bonus for a solve without pencil marks", () => {
      expect(notesAward(createScore())).toBe(BASE * MAX_NOTES_BONUS);
    });

    it("pays less for every distinct mark, down to zero at the budget", () => {
      let previous = notesBonus(0, CONTEXT);
      for (let marks = 1; marks <= budget; marks++) {
        const bonus = notesBonus(marks, CONTEXT);
        expect(bonus).toBeLessThan(previous);
        previous = bonus;
      }
      expect(notesBonus(budget, CONTEXT)).toBe(0);
      expect(notesBonus(budget * 3, CONTEXT)).toBe(0);
    });

    it("counts each mark once and never gives one back when it is removed", () => {
      const score = run(createScore(), [note(0, 1)], [note(0, 1, false)], [note(0, 1)], [note(0, 1, false)]);
      expect(score.noteMarks).toHaveLength(1);
      expect(notesAward(score)).toBe(notesBonus(1, CONTEXT));
      expect(run(score, [note(0, 2)], [note(1, 1)]).noteMarks).toHaveLength(3);
    });

    it("scales the budget to the puzzle's open cells", () => {
      const wide = { ...CONTEXT, openCells: REFERENCE_OPEN_CELLS * 2 };
      expect(notesBonus(budget, wide)).toBe(Math.round((BASE * MAX_NOTES_BONUS) / 2));
    });

  });

  describe("score breakdown", () => {
    const solvedEvent: GameEvent = { type: GameEventType.PuzzleSolved, mistakes: 0 };
    const note: GameEvent = { type: GameEventType.NoteToggled, cell: 5, digit: 3, added: true };
    const playthrough: GameEvent[][] = [[correct(0)], [correct(1)], [note], [{ type: GameEventType.UnitCompleted, unit: ROWS[0] }]];
    const fast = { ...CONTEXT, elapsedMs: TOP_MS + HALF_LIFE_MS / 3 };

    it("keeps points per reason that add up to the total", () => {
      const score = run(createScore(), ...playthrough, wrong(7), [correct(8)]);
      const sum = Object.values(score.pointsByReason).reduce((total, points) => total + points, 0);
      expect(sum).toBe(score.points);
      expect(score.pointsByReason[AwardReason.Mistake]).toBe(-mistakePenalty(1, Difficulty.Medium));
      expect(score.pointsByReason[AwardReason.Unit]).toBe(BASE * UNIT_BONUS);
    });

    it("projects exactly what solving now would pay", () => {
      for (const extra of [[], wrong(9)]) {
        const score = run(createScore(), ...playthrough, extra);
        const breakdown = scoreBreakdown(score, fast);
        const solved = scoreEvents(score, [{ ...solvedEvent, mistakes: score.mistakes }], fast);
        expect(breakdown.projectedTotal).toBe(solved.score.points);
        expect(breakdown.projectedSolve).toEqual(solved.awards);
      }
    });

    it("shows the next digit, the next mistake and what is still in reach", () => {
      const clean = scoreBreakdown(run(createScore(), [correct(0)]), CONTEXT);
      expect(clean).toMatchObject({ combo: 1, nextMistakePenalty: mistakePenalty(1, Difficulty.Medium), flawlessPossible: true, noteMarks: 0 });
      expect(clean.nextDigitPoints).toBe(scoreEvents(run(createScore(), [correct(0)]), [correct(1)], CONTEXT).awards[0].points);
      const afterMistake = scoreBreakdown(run(createScore(), wrong(0)), CONTEXT);
      expect(afterMistake).toMatchObject({ flawlessPossible: false, nextMistakePenalty: mistakePenalty(2, Difficulty.Medium) });
      expect(afterMistake.projectedSolve.map((award) => award.reason)).not.toContain(AwardReason.Flawless);
    });
  });
});
