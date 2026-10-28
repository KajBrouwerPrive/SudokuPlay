// Display formatting shared by the game screen and the statistics page.

const SECOND_MS = 1000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;

const twoDigits = (value: number) => String(value).padStart(2, "0");

/** Play time as "4:07", or "1:02:09" from an hour on. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / SECOND_MS));
  const hours = Math.floor(totalSeconds / HOUR_SECONDS);
  const minutes = Math.floor((totalSeconds % HOUR_SECONDS) / MINUTE_SECONDS);
  const seconds = totalSeconds % MINUTE_SECONDS;
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}` : `${minutes}:${twoDigits(seconds)}`;
}

/** The combo multiplier as "×1.4". */
export function formatMultiplier(multiplier: number): string {
  return `×${multiplier.toFixed(1)}`;
}

const POINTS_FORMAT = new Intl.NumberFormat("nl-NL");

/** Points with Dutch thousands separators: "12.345". */
export function formatPoints(points: number): string {
  return POINTS_FORMAT.format(points);
}
