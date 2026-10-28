// Keeps statistics in localStorage on this device. Storage can be full, blocked (private mode)
// or hold something unexpected; every failure is logged and the app carries on without stats.
import { addGame, emptyStats, parseStats, type GameRecord, type StatsData } from "./stats";

export const STATS_STORAGE_KEY = "sudokuplay.stats.v1";

type StatsStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StatsStorage | null {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("Statistics are off: localStorage is not available.", error);
    return null;
  }
}

export function loadStats(storage: StatsStorage | null = defaultStorage()): StatsData {
  if (!storage) return emptyStats();
  try {
    const raw = storage.getItem(STATS_STORAGE_KEY);
    return raw === null ? emptyStats() : parseStats(JSON.parse(raw));
  } catch (error) {
    console.warn("Stored statistics could not be read; starting fresh.", error);
    return emptyStats();
  }
}

/** Returns false when the data could not be saved. */
export function saveStats(data: StatsData, storage: StatsStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STATS_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn("Statistics could not be saved.", error);
    return false;
  }
}

export function recordGame(record: GameRecord, storage: StatsStorage | null = defaultStorage()): boolean {
  return saveStats(addGame(loadStats(storage), record), storage);
}
