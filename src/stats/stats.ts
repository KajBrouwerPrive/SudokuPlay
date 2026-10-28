// Statistics over finished games: the stored records and pure summaries for the stats page.
// Storage itself lives in storage.ts; everything here is plain data in, plain data out.
import { DIFFICULTIES, type Difficulty } from "../engine";

export const STATS_VERSION = 1;
/** Older games are dropped beyond this, so storage stays small. */
export const MAX_RECORDS = 500;
export const RECENT_COUNT = 10;
/** Solved games shown in the score chart. */
export const SCORE_HISTORY_COUNT = 20;

export const GameOutcome = {
  Solved: "solved",
  /** A new game or closing the page before solving. */
  Abandoned: "abandoned",
} as const;
export type GameOutcome = (typeof GameOutcome)[keyof typeof GameOutcome];

export interface GameRecord {
  /** ISO timestamp. */
  finishedAt: string;
  difficulty: Difficulty;
  seed: number;
  points: number;
  mistakes: number;
  hints: number;
  durationMs: number;
  outcome: GameOutcome;
}

export interface StatsData {
  version: typeof STATS_VERSION;
  /** Oldest first. */
  games: GameRecord[];
}

export interface LevelSummary {
  difficulty: Difficulty;
  played: number;
  solved: number;
  bestPoints: number | null;
  bestTimeMs: number | null;
  averageTimeMs: number | null;
}

export interface StatsSummary {
  gamesPlayed: number;
  gamesSolved: number;
  totalPoints: number;
  levels: LevelSummary[];
  /** Solved games in a row, counting back from the latest game. */
  solvedStreak: number;
  bestSolvedStreak: number;
  /** Days in a row with a solved game, ending today or yesterday. */
  dayStreak: number;
  /** Newest first. */
  recent: GameRecord[];
  /** Points of the latest solved games, oldest first. */
  scoreHistory: number[];
}

export function emptyStats(): StatsData {
  return { version: STATS_VERSION, games: [] };
}

const OUTCOMES: readonly unknown[] = Object.values(GameOutcome);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function isGameRecord(value: unknown): value is GameRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.finishedAt === "string" &&
    !Number.isNaN(Date.parse(record.finishedAt)) &&
    DIFFICULTIES.some((difficulty) => difficulty === record.difficulty) &&
    isCount(record.seed) &&
    isCount(record.points) &&
    isCount(record.mistakes) &&
    isCount(record.hints) &&
    isCount(record.durationMs) &&
    OUTCOMES.includes(record.outcome)
  );
}

/** Reads stored data defensively: unknown versions start over, broken records are dropped. */
export function parseStats(raw: unknown): StatsData {
  if (typeof raw !== "object" || raw === null) return emptyStats();
  const data = raw as Record<string, unknown>;
  if (data.version !== STATS_VERSION || !Array.isArray(data.games)) return emptyStats();
  return { version: STATS_VERSION, games: data.games.filter(isGameRecord) };
}

export function addGame(data: StatsData, record: GameRecord): StatsData {
  return { ...data, games: [...data.games, record].slice(-MAX_RECORDS) };
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function minimum(values: number[]): number | null {
  return values.length === 0 ? null : Math.min(...values);
}

function maximum(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

/** A calendar day in local time, so a streak follows the player's own midnight. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function previousDay(date: Date): Date {
  const day = new Date(date);
  day.setDate(day.getDate() - 1);
  return day;
}

function dayStreak(solved: GameRecord[], today: Date): number {
  const days = new Set(solved.map((game) => dayKey(new Date(game.finishedAt))));
  // A streak still counts today if the last solve was yesterday: there is time left to extend it.
  let day = days.has(dayKey(today)) ? today : previousDay(today);
  let streak = 0;
  while (days.has(dayKey(day))) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}

function solvedStreaks(games: GameRecord[]): { current: number; best: number } {
  let current = 0;
  let best = 0;
  for (const game of games) {
    current = game.outcome === GameOutcome.Solved ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return { current, best };
}

export function summarize(data: StatsData, today: Date): StatsSummary {
  const { games } = data;
  const solved = games.filter((game) => game.outcome === GameOutcome.Solved);
  const streaks = solvedStreaks(games);
  return {
    gamesPlayed: games.length,
    gamesSolved: solved.length,
    totalPoints: solved.reduce((sum, game) => sum + game.points, 0),
    levels: DIFFICULTIES.map((difficulty) => {
      const level = games.filter((game) => game.difficulty === difficulty);
      const levelSolved = level.filter((game) => game.outcome === GameOutcome.Solved);
      const times = levelSolved.map((game) => game.durationMs);
      return {
        difficulty,
        played: level.length,
        solved: levelSolved.length,
        bestPoints: maximum(levelSolved.map((game) => game.points)),
        bestTimeMs: minimum(times),
        averageTimeMs: average(times),
      };
    }),
    solvedStreak: streaks.current,
    bestSolvedStreak: streaks.best,
    dayStreak: dayStreak(solved, today),
    recent: games.slice(-RECENT_COUNT).reverse(),
    scoreHistory: solved.slice(-SCORE_HISTORY_COUNT).map((game) => game.points),
  };
}
