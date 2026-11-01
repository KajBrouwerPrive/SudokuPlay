// Puzzle generator: fill a random full grid, then clear cells while the puzzle stays solvable
// without guessing at or below the target level. A puzzle the logical techniques solve completely
// has exactly one solution, so the expensive uniqueness search runs only once, as a final check.
// Deterministic: the same seed and difficulty always give the same puzzle.
//
// Too slow for expert puzzles at runtime (X-Wing puzzles are rare); scripts/build-puzzle-bank.ts
// runs it offline and the app serves transformed bank puzzles instead (see puzzleBank.ts).
import { Difficulty, difficultyRank, gradePuzzle } from "./grader";
import { CELL_COUNT, EMPTY, cloneGrid, createEmptyGrid, type Grid } from "./grid";
import { createRandom, type Random } from "./random";
import { SolveStatus, hasUniqueSolution, solve } from "./solver";

/** Fewer givens make a puzzle feel harder even with easy techniques, so easier levels keep more. */
export const MIN_GIVENS: Readonly<Record<Difficulty, number>> = {
  [Difficulty.Easy]: 36,
  [Difficulty.Medium]: 28,
  [Difficulty.Hard]: 25,
  [Difficulty.Expert]: 22,
};

/** Full grids to try before settling for the closest (easier) puzzle found. */
export const DEFAULT_MAX_ATTEMPTS = 40;

const ALL_CELLS: readonly number[] = Array.from({ length: CELL_COUNT }, (_, cell) => cell);

export interface GenerateOptions {
  difficulty: Difficulty;
  seed: number;
  maxAttempts?: number;
}

export interface GeneratedPuzzle {
  puzzle: Grid;
  solution: Grid;
  /** The graded level; lower than requested only when no attempt reached the target. */
  difficulty: Difficulty;
  seed: number;
  attempts: number;
}

export function randomSolution(random: Random): Grid {
  const result = solve(createEmptyGrid(), { random });
  if (result.status !== SolveStatus.Solved) throw new Error("An empty grid always has a solution");
  return result.solution;
}

/**
 * Clears cells one at a time in random order. Cells are not cleared in symmetric pairs: pairs
 * get stuck at easier levels far more often, which made hard puzzles rare.
 */
function digHoles(solution: Grid, target: Difficulty, random: Random): Grid {
  const puzzle = cloneGrid(solution);
  const targetRank = difficultyRank(target);
  let givens = CELL_COUNT;
  for (const cell of random.shuffle(ALL_CELLS)) {
    if (givens - 1 < MIN_GIVENS[target]) break;
    puzzle[cell] = EMPTY;
    const grade = gradePuzzle(puzzle);
    if (grade.solvedLogically && difficultyRank(grade.difficulty) <= targetRank) givens--;
    else puzzle[cell] = solution[cell];
  }
  return puzzle;
}

export function generatePuzzle({ difficulty, seed, maxAttempts = DEFAULT_MAX_ATTEMPTS }: GenerateOptions): GeneratedPuzzle {
  if (maxAttempts < 1) throw new RangeError(`maxAttempts must be at least 1, got ${maxAttempts}`);
  const random = createRandom(seed);
  let best: GeneratedPuzzle | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solution = randomSolution(random);
    const puzzle = digHoles(solution, difficulty, random);
    const grade = gradePuzzle(puzzle);
    // digHoles only keeps logically solvable states, and a full grid grades as easy.
    if (!grade.solvedLogically) throw new Error("Generated puzzle is not logically solvable");
    if (!hasUniqueSolution(puzzle)) throw new Error("Generated puzzle has more than one solution");
    const candidate: GeneratedPuzzle = { puzzle, solution, difficulty: grade.difficulty, seed, attempts: attempt };
    if (grade.difficulty === difficulty) return candidate;
    if (!best || difficultyRank(grade.difficulty) > difficultyRank(best.difficulty)) best = candidate;
  }
  return { ...best!, attempts: maxAttempts };
}
