// Points, as a pure reducer over game events: `scoreEvents(score, events, context)` returns the
// new score plus one award per change, which the UI animates ("+15", "÷2").
//
// Rules: correct digits earn the level's base points times a combo multiplier that grows with
// every correct digit in a row; completing a unit, a digit or the puzzle adds bonuses, with extra
// for a flawless or fast solve. A mistake costs more with every mistake and resets the combo; a
// hint halves positive points. Digit points are scaled to a fixed number of open cells, so every
// puzzle of a level pays the same for the same play, and time is what sets two clean solves apart.
// Mistakes weigh more than slowness: the first one costs more than half the speed bonus (penalty
// plus the lost flawless bonus), two cost more than all of it. Points may go below zero
// during play, so an early mistake is not free. Every cell, unit and digit pays out once, so undo
// and replay cannot farm points, and like mistakes, penalties are never undone.
import { GameEventType, type GameEvent } from "./game";
import { Difficulty } from "./grader";
import type { Digit, Unit } from "./grid";

export const BASE_POINTS: Readonly<Record<Difficulty, number>> = {
  [Difficulty.Easy]: 10,
  [Difficulty.Medium]: 15,
  [Difficulty.Hard]: 25,
  [Difficulty.Expert]: 40,
};

/** A solve faster than this earns a speed bonus, more the faster it is. */
export const TARGET_TIME_MS: Readonly<Record<Difficulty, number>> = {
  [Difficulty.Easy]: 8 * 60_000,
  [Difficulty.Medium]: 15 * 60_000,
  [Difficulty.Hard]: 25 * 60_000,
  [Difficulty.Expert]: 40 * 60_000,
};

/** Digit points are scaled as if every puzzle left this many cells open. */
export const REFERENCE_OPEN_CELLS = 45;

/** Each correct digit in a row adds this to the multiplier, up to the maximum. The step is for the
 * reference number of open cells; a puzzle with more open cells climbs proportionally slower. */
export const COMBO_STEP = 0.1;
export const MAX_MULTIPLIER = 2;

/** Bonuses, in multiples of the level's base points. */
export const UNIT_BONUS = 2;
export const DIGIT_BONUS = 3;
export const SOLVE_BONUS = 20;
export const FLAWLESS_BONUS = 10;
/** The speed bonus for an instant solve; it shrinks linearly to zero at the target time. */
export const MAX_SPEED_BONUS = 30;
/** The n-th mistake costs n times this, in base points, up to the maximum per mistake. */
export const MISTAKE_PENALTY_STEP = 10;
export const MAX_MISTAKE_PENALTY = 30;

export const AwardReason = {
  Digit: "digit",
  Unit: "unit",
  DigitCompleted: "digitCompleted",
  Solve: "solve",
  Flawless: "flawless",
  Speed: "speed",
  Mistake: "mistake",
  Hint: "hint",
} as const;
export type AwardReason = (typeof AwardReason)[keyof typeof AwardReason];

export interface Award {
  reason: AwardReason;
  /** The change in points: negative for a mistake or hint. */
  points: number;
  /** Where it happened, for awards tied to one cell. */
  cell: number | null;
}

export interface Score {
  points: number;
  /** Correct digits in a row without a mistake or hint. */
  combo: number;
  mistakes: number;
  hints: number;
  /** Cells, units ("row-3") and digits that already paid out. */
  paidCells: readonly number[];
  paidUnits: readonly string[];
  paidDigits: readonly Digit[];
  /** The rounding the digit points so far left over, carried into the next digit so scaled
   * points add up to the same total on every puzzle. */
  digitRounding: number;
}

export interface ScoreContext {
  difficulty: Difficulty;
  /** Play time so far, for the speed bonus. */
  elapsedMs: number;
  /** Cells the puzzle left open at the start, to scale digit points to the reference. */
  openCells: number;
}

export function createScore(): Score {
  return { points: 0, combo: 0, mistakes: 0, hints: 0, paidCells: [], paidUnits: [], paidDigits: [], digitRounding: 0 };
}

/** The multiplier the next correct digit earns with this combo already standing. */
export function multiplierFor(combo: number, openCells: number): number {
  return Math.min(1 + COMBO_STEP * combo * referenceScale(openCells), MAX_MULTIPLIER);
}

/** How much one cell of this puzzle counts compared to one of the reference puzzle. */
function referenceScale(openCells: number): number {
  return REFERENCE_OPEN_CELLS / Math.max(1, openCells);
}

/** What the n-th mistake (1-based) costs, in points. */
export function mistakePenalty(mistakeNumber: number, difficulty: Difficulty): number {
  return Math.min(MISTAKE_PENALTY_STEP * mistakeNumber, MAX_MISTAKE_PENALTY) * BASE_POINTS[difficulty];
}

/** What a correct digit earns with this combo standing, scaled to the reference number of open
 * cells; unrounded, as the score carries the rounding from digit to digit. */
export function digitPoints(combo: number, context: ScoreContext): number {
  const multiplier = multiplierFor(combo, context.openCells);
  return BASE_POINTS[context.difficulty] * multiplier * referenceScale(context.openCells);
}

const unitKey = (unit: Unit) => `${unit.kind}-${unit.index}`;

export function speedBonus(context: ScoreContext): number {
  const share = 1 - context.elapsedMs / TARGET_TIME_MS[context.difficulty];
  return Math.max(0, Math.round(MAX_SPEED_BONUS * BASE_POINTS[context.difficulty] * share));
}

export function scoreEvents(score: Score, events: readonly GameEvent[], context: ScoreContext): { score: Score; awards: Award[] } {
  const base = BASE_POINTS[context.difficulty];
  const awards: Award[] = [];
  let next = score;
  // A hinted digit lands in the same batch as its HintUsed; it earns nothing.
  let hintedCell: number | null = null;
  const award = (reason: AwardReason, points: number, cell: number | null = null) => {
    if (points === 0) return;
    awards.push({ reason, points, cell });
    next = { ...next, points: next.points + points };
  };

  for (const event of events) {
    switch (event.type) {
      case GameEventType.HintUsed:
        hintedCell = event.cell;
        next = { ...next, combo: 0, hints: next.hints + 1, paidCells: [...next.paidCells, event.cell] };
        // Halving a negative score would raise it; a hint only costs when there is something to halve.
        if (next.points > 0) award(AwardReason.Hint, -Math.ceil(next.points / 2), event.cell);
        break;
      case GameEventType.CellPlaced: {
        if (!event.correct || event.cell === hintedCell || next.paidCells.includes(event.cell)) break;
        const exact = digitPoints(next.combo, context) + next.digitRounding;
        const points = Math.round(exact);
        award(AwardReason.Digit, points, event.cell);
        next = { ...next, combo: next.combo + 1, paidCells: [...next.paidCells, event.cell], digitRounding: exact - points };
        break;
      }
      case GameEventType.MistakeMade:
        next = { ...next, combo: 0, mistakes: next.mistakes + 1 };
        award(AwardReason.Mistake, -mistakePenalty(next.mistakes, context.difficulty), event.cell);
        break;
      case GameEventType.UnitCompleted:
        if (next.paidUnits.includes(unitKey(event.unit))) break;
        next = { ...next, paidUnits: [...next.paidUnits, unitKey(event.unit)] };
        award(AwardReason.Unit, base * UNIT_BONUS);
        break;
      case GameEventType.DigitCompleted:
        if (next.paidDigits.includes(event.digit)) break;
        next = { ...next, paidDigits: [...next.paidDigits, event.digit] };
        award(AwardReason.DigitCompleted, base * DIGIT_BONUS);
        break;
      case GameEventType.PuzzleSolved:
        award(AwardReason.Solve, base * SOLVE_BONUS);
        if (event.mistakes === 0 && next.hints === 0) award(AwardReason.Flawless, base * FLAWLESS_BONUS);
        award(AwardReason.Speed, speedBonus(context));
        break;
      default:
        break;
    }
  }
  return { score: next, awards };
}
