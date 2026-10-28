import { useCallback, useEffect, useRef, useState } from "react";

/** A second press within this time confirms the hint. */
export const HINT_CONFIRM_MS = 3000;

/**
 * A hint costs half the points, so it takes two presses: the first asks, the second (within
 * HINT_CONFIRM_MS) gives the hint. Returns whether it is asking, and the press handler.
 */
export function useHintConfirm(onConfirm: () => void): { confirming: boolean; request: () => void } {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const request = useCallback(() => {
    clearTimer();
    if (confirming) {
      setConfirming(false);
      onConfirm();
      return;
    }
    setConfirming(true);
    timerRef.current = window.setTimeout(() => setConfirming(false), HINT_CONFIRM_MS);
  }, [confirming, onConfirm]);

  useEffect(() => clearTimer, []);
  return { confirming, request };
}
