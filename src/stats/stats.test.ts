import { describe, expect, it, vi } from "vitest";
import { Difficulty } from "../engine";
import { GameOutcome, MAX_RECORDS, RECENT_COUNT, STATS_VERSION, addGame, emptyStats, parseStats, summarize, type GameRecord } from "./stats";
import { STATS_STORAGE_KEY, loadStats, recordGame, saveStats } from "./storage";

const TODAY = new Date(2026, 9, 28, 15, 0);

function game(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    finishedAt: TODAY.toISOString(),
    difficulty: Difficulty.Easy,
    seed: 1,
    points: 100,
    mistakes: 0,
    hints: 0,
    durationMs: 300_000,
    outcome: GameOutcome.Solved,
    ...overrides,
  };
}

const daysAgo = (days: number) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - days, 12).toISOString();
const withGames = (...games: GameRecord[]) => games.reduce(addGame, emptyStats());

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

describe("parseStats", () => {
  it("keeps valid records and drops broken ones", () => {
    const parsed = parseStats({ version: STATS_VERSION, games: [game(), { ...game(), points: -1 }, { ...game(), difficulty: "impossible" }, null] });
    expect(parsed.games).toEqual([game()]);
  });

  it("starts over for an unknown version or shape", () => {
    expect(parseStats({ version: 99, games: [game()] })).toEqual(emptyStats());
    expect(parseStats("nonsense")).toEqual(emptyStats());
    expect(parseStats(null)).toEqual(emptyStats());
  });
});

describe("addGame", () => {
  it("keeps only the newest records", () => {
    let data = emptyStats();
    for (let seed = 0; seed < MAX_RECORDS + 5; seed++) data = addGame(data, game({ seed }));
    expect(data.games).toHaveLength(MAX_RECORDS);
    expect(data.games[0].seed).toBe(5);
  });
});

describe("summarize", () => {
  it("summarizes per level: played, solved, best score and times", () => {
    const data = withGames(
      game({ points: 120, durationMs: 200_000 }),
      game({ points: 90, durationMs: 400_000 }),
      game({ outcome: GameOutcome.Abandoned, points: 999, durationMs: 1 }),
      game({ difficulty: Difficulty.Expert, points: 800 }),
    );
    const summary = summarize(data, TODAY);
    expect(summary.levels.find((level) => level.difficulty === Difficulty.Easy)).toEqual({
      difficulty: Difficulty.Easy,
      played: 3,
      solved: 2,
      bestPoints: 120,
      bestTimeMs: 200_000,
      averageTimeMs: 300_000,
      averageMistakes: 0,
    });
    expect(summary.levels.find((level) => level.difficulty === Difficulty.Medium)).toMatchObject({ played: 0, bestPoints: null, averageTimeMs: null });
    expect(summary).toMatchObject({ gamesPlayed: 4, gamesSolved: 3, totalPoints: 1010 });
  });

  it("counts mistakes: in total, on average per level, and flawless solves", () => {
    const data = withGames(game({ mistakes: 0 }), game({ mistakes: 2 }), game({ mistakes: 3, outcome: GameOutcome.Abandoned }), game({ difficulty: Difficulty.Hard, mistakes: 1 }));
    const summary = summarize(data, TODAY);
    expect(summary).toMatchObject({ totalMistakes: 6, flawlessSolved: 1 });
    expect(summary.levels.find((level) => level.difficulty === Difficulty.Easy)?.averageMistakes).toBe(1.7);
    expect(summary.levels.find((level) => level.difficulty === Difficulty.Medium)?.averageMistakes).toBeNull();
  });

  it("counts solved games in a row, current and best", () => {
    const solved = game();
    const abandoned = game({ outcome: GameOutcome.Abandoned });
    const summary = summarize(withGames(solved, solved, solved, abandoned, solved, solved), TODAY);
    expect(summary).toMatchObject({ solvedStreak: 2, bestSolvedStreak: 3 });
  });

  it("counts days in a row with a solve, still alive when the last one was yesterday", () => {
    expect(summarize(withGames(game({ finishedAt: daysAgo(2) }), game({ finishedAt: daysAgo(1) }), game({ finishedAt: daysAgo(0) })), TODAY).dayStreak).toBe(3);
    expect(summarize(withGames(game({ finishedAt: daysAgo(2) }), game({ finishedAt: daysAgo(1) })), TODAY).dayStreak).toBe(2);
    expect(summarize(withGames(game({ finishedAt: daysAgo(3) }), game({ finishedAt: daysAgo(2) })), TODAY).dayStreak).toBe(0);
    expect(summarize(withGames(game({ finishedAt: daysAgo(0), outcome: GameOutcome.Abandoned })), TODAY).dayStreak).toBe(0);
  });

  it("lists recent games newest first and the score history of solved games oldest first", () => {
    const games = Array.from({ length: RECENT_COUNT + 2 }, (_, seed) => game({ seed, points: seed * 10 }));
    const summary = summarize(withGames(...games, game({ seed: 99, outcome: GameOutcome.Abandoned })), TODAY);
    expect(summary.recent).toHaveLength(RECENT_COUNT);
    expect(summary.recent[0].seed).toBe(99);
    expect(summary.scoreHistory.at(-1)).toBe((RECENT_COUNT + 1) * 10);
    expect(summary.scoreHistory).not.toContain(undefined);
  });
});

describe("storage", () => {
  it("saves and loads a game", () => {
    const storage = new MemoryStorage();
    expect(recordGame(game(), storage)).toBe(true);
    expect(loadStats(storage).games).toEqual([game()]);
  });

  it("starts fresh on unreadable data, and reports a failed save", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = new MemoryStorage();
    storage.setItem(STATS_STORAGE_KEY, "{not json");
    expect(loadStats(storage)).toEqual(emptyStats());
    const full = { getItem: () => null, setItem: () => {
      throw new Error("quota exceeded");
    } };
    expect(saveStats(emptyStats(), full)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("works without storage at all", () => {
    expect(loadStats(null)).toEqual(emptyStats());
    expect(saveStats(emptyStats(), null)).toBe(false);
  });
});
