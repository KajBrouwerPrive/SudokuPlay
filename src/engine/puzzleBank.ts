// Runtime puzzle source: picks a bank puzzle of the requested level by seed and disguises it with
// a random transformation. Instant, deterministic per seed, and the level is guaranteed.
import type { Difficulty } from "./grader";
import { parseGrid, type Grid } from "./grid";
import { PUZZLE_BANK } from "./puzzleBank.generated";
import { createRandom } from "./random";
import { SolveStatus, solve } from "./solver";
import { applyTransform, randomTransform } from "./transform";

export interface Puzzle {
  puzzle: Grid;
  solution: Grid;
  difficulty: Difficulty;
  seed: number;
}

export function createPuzzle({ difficulty, seed }: { difficulty: Difficulty; seed: number }): Puzzle {
  const bank = PUZZLE_BANK[difficulty];
  if (bank.length === 0) throw new Error(`The puzzle bank has no ${difficulty} puzzles`);
  const random = createRandom(seed);
  const base = parseGrid(bank[random.nextInt(bank.length)]);
  const puzzle = applyTransform(base, randomTransform(random));
  const result = solve(puzzle);
  if (result.status !== SolveStatus.Solved) throw new Error(`Bank puzzle for seed ${seed} has no solution`);
  return { puzzle, solution: result.solution, difficulty, seed };
}
