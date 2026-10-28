import { useEffect, useState } from "react";

const COUNT_UP_MS = 700;

/** Counts from 0 up to `target` with an ease-out, once per target; shows it straight away in reduced motion. */
export function useCountUp(target: number, reducedMotion: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reducedMotion) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min((now - start) / COUNT_UP_MS, 1);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reducedMotion]);
  return reducedMotion ? target : value;
}
