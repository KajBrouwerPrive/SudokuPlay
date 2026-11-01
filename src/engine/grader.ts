// Grades a puzzle by solving it the way a person would: the hardest technique it needs sets the level.
import { type Grid } from "./grid";
import { Technique, applyStep, createLogicState, findNextStep, type LogicStep } from "./logic";
import { isComplete } from "./validator";

export const Difficulty = {
  Easy: "easy",
  Medium: "medium",
  Hard: "hard",
  Expert: "expert",
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

/** Easiest first; compare levels with `difficultyRank`. */
export const DIFFICULTIES: readonly Difficulty[] = [Difficulty.Easy, Difficulty.Medium, Difficulty.Hard, Difficulty.Expert];

export const TECHNIQUE_DIFFICULTY: Readonly<Record<Technique, Difficulty>> = {
  [Technique.HiddenSingle]: Difficulty.Easy,
  [Technique.NakedSingle]: Difficulty.Easy,
  [Technique.Pointing]: Difficulty.Medium,
  [Technique.Claiming]: Difficulty.Medium,
  [Technique.NakedPair]: Difficulty.Hard,
  [Technique.HiddenPair]: Difficulty.Hard,
  [Technique.NakedTriple]: Difficulty.Hard,
  [Technique.HiddenTriple]: Difficulty.Hard,
  [Technique.XWing]: Difficulty.Expert,
};

export function difficultyRank(difficulty: Difficulty): number {
  return DIFFICULTIES.indexOf(difficulty);
}

export type GradeResult =
  | {
      /** Every cell was filled using the known techniques. */
      solvedLogically: true;
      difficulty: Difficulty;
      steps: LogicStep[];
    }
  | {
      /** The techniques got stuck: the puzzle needs guessing or a technique the engine does not know. */
      solvedLogically: false;
      steps: LogicStep[];
    };

export function gradePuzzle(puzzle: Grid): GradeResult {
  const state = createLogicState(puzzle);
  const steps: LogicStep[] = [];
  let hardestRank = difficultyRank(Difficulty.Easy);
  while (!isComplete(state.grid)) {
    const next = findNextStep(state);
    if (!next) return { solvedLogically: false, steps };
    applyStep(state, next);
    steps.push(next);
    hardestRank = Math.max(hardestRank, difficultyRank(TECHNIQUE_DIFFICULTY[next.technique]));
  }
  return { solvedLogically: true, difficulty: DIFFICULTIES[hardestRank], steps };
}
