// Seeded pseudo-random numbers (mulberry32), so a seed always yields the same puzzle.
// Not for anything security-related.

export interface Random {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** A shuffled copy (Fisher-Yates); the input is left untouched. */
  shuffle<T>(items: readonly T[]): T[];
}

const UINT32_RANGE = 2 ** 32;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
  const nextInt = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
      throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swapWith = nextInt(index + 1);
      [result[index], result[swapWith]] = [result[swapWith], result[index]];
    }
    return result;
  };
  return { next, nextInt, shuffle };
}

/** A stable 32-bit seed from text (FNV-1a), for seeds such as "2026-10-28" for a daily puzzle. */
export function seedFromText(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}
