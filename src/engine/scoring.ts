// Points, as a pure reducer over game events: `scoreEvents(score, events, context)` returns the
// new score plus one award per change, which the UI animates ("+15", "÷2").
//
// Rules: correct digits earn the level's base points times a combo multiplier that grows with
// every correct digit in a row; completing a unit, a digit or the puzzle adds bonuses, with extra
// for a flawless or fast solve. A mistake costs more with every mistake and resets the combo; a
// hint halves positive points. Mistakes weigh more than slowness: the first one already costs more
// than the whole speed bonus (penalty plus the lost flawless bonus). Points may go below zero
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

/** Each correct digit in a row adds this to the multiplier, up to the maximum. */
export const COMBO_STEP = 0.1;
export const MAX_MULTIPLIER = 2;

/** Bonuses, in multiples of the level's base points. */
export const UNIT_BONUS = 2;
export const DIGIT_BONUS = 3;
export const SOLVE_BONUS = 20;
export const FLAWLESS_BONUS = 10;
/** The speed bonus for an instant solve; it shrinks linearly to zero at the target time. */
export const MAX_SPEED_BONUS = 10;
/** The n-th mistake costs n times this, in base points, up to the maximum per mistake. */
export const MISTAKE_PENALTY_STEP = 5;
export const MAX_MISTAKE_PENALTY = 15;

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
}

export interface ScoreContext {
  difficulty: Difficulty;
  /** Play time so far, for the speed bonus. */
  elapsedMs: number;
}

export function createScore(): Score {
  return { points: 0, combo: 0, mistakes: 0, hints: 0, paidCells: [], paidUnits: [], paidDigits: [] };
}

/** The multiplier the next correct digit earns with this combo already standing. */
export function multiplierFor(combo: number): number {
  return Math.min(1 + COMBO_STEP * combo, MAX_MULTIPLIER);
}

/** What the n-th mistake (1-based) costs, in points. */
export function mistakePenalty(mistakeNumber: number, difficulty: Difficulty): number {
  return Math.min(MISTAKE_PENALTY_STEP * mistakeNumber, MAX_MISTAKE_PENALTY) * BASE_POINTS[difficulty];
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
      case GameEventType.CellPlaced:
        if (!event.correct || event.cell === hintedCell || next.paidCells.includes(event.cell)) break;
        award(AwardReason.Digit, Math.round(base * multiplierFor(next.combo)), event.cell);
        next = { ...next, combo: next.combo + 1, paidCells: [...next.paidCells, event.cell] };
        break;
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
