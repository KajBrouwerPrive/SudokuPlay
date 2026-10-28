import { useEffect } from "react";

const TICK_MS = 1000;

/**
 * Reports play time every second while `playing`. Time with the page hidden (another tab, a
 * locked phone) does not count: the clock restarts from the moment the page is visible again.
 */
export function usePlayTimer(playing: boolean, onElapsed: (elapsedMs: number) => void): void {
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      if (!document.hidden) onElapsed(now - last);
      last = now;
    };
    const onVisibilityChange = () => {
      if (!document.hidden) last = performance.now();
    };
    const interval = window.setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [playing, onElapsed]);
}
