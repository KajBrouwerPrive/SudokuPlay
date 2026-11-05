// Points, as a pure reducer over game events: `scoreEvents(score, events, context)` returns the
// new score plus one award per change, which the UI animates ("+15", "−15").
//
// Rules: correct digits earn the level's base points times a combo multiplier that grows with
// every correct digit in a row; completing a unit, a digit or the puzzle adds small bonuses. A
// mistake costs more with every mistake and resets the combo. A hint costs three quarters of what
// the next mistake would: three quarters of its penalty and of the flawless bonus, whenever it is
// taken, so it is cheaper than a mistake in every situation; it resets the combo and the hinted
// digit earns nothing. Digit
// points are scaled to a fixed number of open cells, so every puzzle of a level pays the same for
// the same play. Points may go below zero during play, so an early mistake is not free.
//
// How well a puzzle is solved weighs more than solving it: the flawless, speed and notes bonuses
// together are worth more than all points for filling the grid. Flawless weighs most, then speed,
// then few pencil marks. The first mistake costs more than the whole speed bonus (penalty plus the
// lost flawless bonus). The speed bonus is built around the average solve time per level: full up
// to half the average, then halving with every half the average slower, so an average solve earns
// half of it and a second saved is worth most for a fast solve.
// The notes bonus shrinks with every distinct pencil mark placed, down to zero at the candidates of
// the starting grid: fully noting the puzzle earns nothing. Marks count when placed and are
// never taken back, so erasing or undoing them does not restore the bonus. Every cell, unit and
// digit pays out once, so undo and replay cannot farm points, and like mistakes, penalties are
// never undone.
import { GameEventType, type GameEvent } from "./game";
import { Difficulty } from "./grader";
import { DIGITS, type Digit, type Unit } from "./grid";

export const BASE_POINTS: Readonly<Record<Difficulty, number>> = {
  [Difficulty.Easy]: 10,
  [Difficulty.Medium]: 15,
  [Difficulty.Hard]: 25,
  [Difficulty.Expert]: 40,
};

/** How long an average solve takes per level; the speed bonus is built around it. Easy, medium and
 * hard are measured; expert is an estimate until it is measured too. */
export const AVERAGE_TIME_MS: Readonly<Record<Difficulty, number>> = {
  [Difficulty.Easy]: 3 * 60_000,
  [Difficulty.Medium]: 5 * 60_000,
  [Difficulty.Hard]: 7 * 60_000,
  [Difficulty.Expert]: 20 * 60_000,
};

/** The top time as a share of the average time: this fast or faster earns the full speed bonus. */
export const SPEED_TOP_TIME_SHARE = 0.5;
/** The half-life as a share of the average time: every this much slower than the top time halves
 * the speed bonus, so a second saved is worth most close to the top time. With both at a half, an
 * average solve earns half the speed bonus. */
export const SPEED_HALF_LIFE_SHARE = 0.5;

const sharesOfAverage = (share: number) =>
  Object.fromEntries(Object.entries(AVERAGE_TIME_MS).map(([level, averageMs]) => [level, averageMs * share])) as Record<Difficulty, number>;

export const SPEED_TOP_TIME_MS: Readonly<Record<Difficulty, number>> = sharesOfAverage(SPEED_TOP_TIME_SHARE);
export const SPEED_HALF_LIFE_MS: Readonly<Record<Difficulty, number>> = sharesOfAverage(SPEED_HALF_LIFE_SHARE);

/** Digit points are scaled as if every puzzle left this many cells open. */
export const REFERENCE_OPEN_CELLS = 45;

/** Each correct digit in a row adds this to the multiplier, up to the maximum. The step is for the
 * reference number of open cells; a puzzle with more open cells climbs proportionally slower. */
export const COMBO_STEP = 0.1;
export const MAX_MULTIPLIER = 2;

/** Bonuses, in multiples of the level's base points. */
export const UNIT_BONUS = 1;
export const DIGIT_BONUS = 1;
export const SOLVE_BONUS = 10;
export const FLAWLESS_BONUS = 110;
/** The speed bonus at or below the top time; it halves with every half-life slower. */
export const MAX_SPEED_BONUS = 105;
/** The notes bonus for a solve without pencil marks; it shrinks linearly to zero at the budget:
 * the candidates of the starting grid (`countAllCandidates`), what fully noting this puzzle takes. */
export const MAX_NOTES_BONUS = 75;
/** What a hint costs compared to a mistake: this share of the mistake penalty and of the flawless
 * bonus. Two hints cost the whole flawless bonus. */
export const HINT_COST_SHARE = 0.75;
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
  Notes: "notes",
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
  /** Points so far per reason, for the developer's score breakdown; they add up to `points`. */
  pointsByReason: Readonly<Record<AwardReason, number>>;
  /** Every distinct pencil mark ever placed, as `noteKey(cell, digit)`. */
  noteMarks: readonly number[];
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
  /** Distinct pencil marks at which the notes bonus reaches zero: every candidate of the starting
   * grid, so fully noting the puzzle earns nothing and noting half of it earns half. */
  notesBudget: number;
}

const zeroByReason = (): Record<AwardReason, number> =>
  Object.fromEntries(Object.values(AwardReason).map((reason) => [reason, 0])) as Record<AwardReason, number>;

export function createScore(): Score {
  return {
    points: 0,
    combo: 0,
    mistakes: 0,
    hints: 0,
    pointsByReason: zeroByReason(),
    paidCells: [],
    paidUnits: [],
    paidDigits: [],
    noteMarks: [],
    digitRounding: 0,
  };
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

/** What a hint costs right away, in points: a share of what the next mistake would cost, so a
 * hint is cheaper than a mistake in every situation. */
export function hintPenalty(mistakes: number, difficulty: Difficulty): number {
  return Math.round(mistakePenalty(mistakes + 1, difficulty) * HINT_COST_SHARE);
}

/** The flawless bonus still in reach: all of it without mistakes or hints, none after a mistake,
 * and every hint takes a share of it. */
export function flawlessBonus(mistakes: number, hints: number, difficulty: Difficulty): number {
  const share = mistakes > 0 ? 0 : Math.max(0, 1 - hints * HINT_COST_SHARE);
  return Math.round(FLAWLESS_BONUS * BASE_POINTS[difficulty] * share);
}

/** What a correct digit earns with this combo standing, scaled to the reference number of open
 * cells; unrounded, as the score carries the rounding from digit to digit. */
export function digitPoints(combo: number, context: ScoreContext): number {
  const multiplier = multiplierFor(combo, context.openCells);
  return BASE_POINTS[context.difficulty] * multiplier * referenceScale(context.openCells);
}

const unitKey = (unit: Unit) => `${unit.kind}-${unit.index}`;

/** The share of the speed bonus a solve in this time earns: 1 up to the top time, then halving
 * with every half-life. It never quite reaches zero; rounding takes care of very slow solves. */
export function speedShare(elapsedMs: number, difficulty: Difficulty): number {
  const overTopMs = Math.max(0, elapsedMs - SPEED_TOP_TIME_MS[difficulty]);
  return 2 ** (-overTopMs / SPEED_HALF_LIFE_MS[difficulty]);
}

export function speedBonus(context: ScoreContext): number {
  return Math.round(MAX_SPEED_BONUS * BASE_POINTS[context.difficulty] * speedShare(context.elapsedMs, context.difficulty));
}

/** Identifies one pencil mark: a digit in a cell. */
export function noteKey(cell: number, digit: Digit): number {
  return cell * DIGITS.length + (digit - 1);
}

/** The notes bonus for this many distinct pencil marks, against the puzzle's own budget. */
export function notesBonus(noteMarks: number, context: ScoreContext): number {
  const share = 1 - noteMarks / Math.max(1, context.notesBudget);
  return Math.max(0, Math.round(MAX_NOTES_BONUS * BASE_POINTS[context.difficulty] * share));
}

/** The awards a solve adds on top of the points so far, in the order they are paid. */
export function solveAwards(score: Score, mistakes: number, context: ScoreContext): Award[] {
  const base = BASE_POINTS[context.difficulty];
  const awards: Award[] = [{ reason: AwardReason.Solve, points: base * SOLVE_BONUS, cell: null }];
  awards.push({ reason: AwardReason.Flawless, points: flawlessBonus(mistakes, score.hints, context.difficulty), cell: null });
  awards.push({ reason: AwardReason.Speed, points: speedBonus(context), cell: null });
  awards.push({ reason: AwardReason.Notes, points: notesBonus(score.noteMarks.length, context), cell: null });
  return awards.filter((award) => award.points !== 0);
}

/** What the next mistake costs in all, not counting the combo it resets. */
export function mistakeCost(score: Score, difficulty: Difficulty): number {
  return mistakePenalty(score.mistakes + 1, difficulty) + flawlessBonus(score.mistakes, score.hints, difficulty);
}

/** What the next hint costs in all, not counting the combo it resets; shown before taking one. */
export function hintCost(score: Score, difficulty: Difficulty): number {
  const flawlessLost = flawlessBonus(score.mistakes, score.hints, difficulty) - flawlessBonus(score.mistakes, score.hints + 1, difficulty);
  return hintPenalty(score.mistakes, difficulty) + flawlessLost;
}

/** Where the score stands and what solving right now would add: for the developer panel. */
export interface ScoreBreakdown {
  points: number;
  pointsByReason: Readonly<Record<AwardReason, number>>;
  /** What a solve at this moment would add, per reason. */
  projectedSolve: readonly Award[];
  /** `points` plus the projected solve awards. */
  projectedTotal: number;
  combo: number;
  multiplier: number;
  /** What the next correct digit earns, rounded. */
  nextDigitPoints: number;
  /** What the next mistake costs, as a positive number. */
  nextMistakePenalty: number;
  /** Whether the flawless bonus is still within reach. */
  /** The flawless bonus still in reach. */
  flawlessRemaining: number;
  /** What the next mistake costs in all: its penalty plus the flawless bonus it takes. */
  nextMistakeCost: number;
  /** What the next hint costs in all: its penalty plus the share of the flawless bonus it takes. */
  nextHintCost: number;
  noteMarks: number;
  /** Distinct pencil marks at which the notes bonus reaches zero. */
  notesBudget: number;
  elapsedMs: number;
  averageTimeMs: number;
  topTimeMs: number;
  halfLifeMs: number;
}

export function scoreBreakdown(score: Score, context: ScoreContext): ScoreBreakdown {
  const projectedSolve = solveAwards(score, score.mistakes, context);
  return {
    points: score.points,
    pointsByReason: score.pointsByReason,
    projectedSolve,
    projectedTotal: score.points + projectedSolve.reduce((sum, award) => sum + award.points, 0),
    combo: score.combo,
    multiplier: multiplierFor(score.combo, context.openCells),
    nextDigitPoints: Math.round(digitPoints(score.combo, context) + score.digitRounding),
    nextMistakePenalty: mistakePenalty(score.mistakes + 1, context.difficulty),
    flawlessRemaining: flawlessBonus(score.mistakes, score.hints, context.difficulty),
    nextMistakeCost: mistakeCost(score, context.difficulty),
    nextHintCost: hintCost(score, context.difficulty),
    noteMarks: score.noteMarks.length,
    notesBudget: context.notesBudget,
    elapsedMs: context.elapsedMs,
    averageTimeMs: AVERAGE_TIME_MS[context.difficulty],
    topTimeMs: SPEED_TOP_TIME_MS[context.difficulty],
    halfLifeMs: SPEED_HALF_LIFE_MS[context.difficulty],
  };
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
    next = {
      ...next,
      points: next.points + points,
      pointsByReason: { ...next.pointsByReason, [reason]: next.pointsByReason[reason] + points },
    };
  };

  for (const event of events) {
    switch (event.type) {
      case GameEventType.HintUsed:
        hintedCell = event.cell;
        next = { ...next, combo: 0, hints: next.hints + 1, paidCells: [...next.paidCells, event.cell] };
        award(AwardReason.Hint, -hintPenalty(next.mistakes, context.difficulty), event.cell);
        break;
      case GameEventType.CellPlaced: {
        if (!event.correct || event.cell === hintedCell || next.paidCells.includes(event.cell)) break;
        const exact = digitPoints(next.combo, context) + next.digitRounding;
        const points = Math.round(exact);
        award(AwardReason.Digit, points, event.cell);
        next = { ...next, combo: next.combo + 1, paidCells: [...next.paidCells, event.cell], digitRounding: exact - points };
        break;
      }
      case GameEventType.NoteToggled: {
        const key = noteKey(event.cell, event.digit);
        if (event.added && !next.noteMarks.includes(key)) next = { ...next, noteMarks: [...next.noteMarks, key] };
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
        for (const solveAward of solveAwards(next, event.mistakes, context)) award(solveAward.reason, solveAward.points);
        break;
      default:
        break;
    }
  }
  return { score: next, awards };
}
