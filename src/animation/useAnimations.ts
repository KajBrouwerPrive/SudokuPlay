import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameEvent } from "../engine";
import type { EventBatch } from "../ui/session";
import { choreograph } from "./choreograph";
import { CuePlayer } from "./player";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Plays the animations for each new event batch. Runs in a layout effect, so a placed digit
 * starts at its first keyframe instead of flashing at full size for one frame.
 * Returns the refs to attach and `playEvents` for previewing effects without changing the game.
 */
export function useAnimations(batch: EventBatch | null, reducedMotion: boolean) {
  const rootRef = useRef<HTMLElement>(null);
  const fxLayerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<CuePlayer | null>(null);
  // StrictMode runs effects twice in development; remember what already played.
  const playedBatchRef = useRef<number | null>(null);

  const player = useCallback((): CuePlayer | null => {
    if (!playerRef.current && rootRef.current && fxLayerRef.current) playerRef.current = new CuePlayer(rootRef.current, fxLayerRef.current);
    return playerRef.current;
  }, []);

  const playEvents = useCallback(
    (events: GameEvent[], reduced: boolean = reducedMotion) => player()?.play(choreograph(events), reduced),
    [player, reducedMotion],
  );

  useLayoutEffect(() => {
    if (!batch || playedBatchRef.current === batch.id) return;
    playedBatchRef.current = batch.id;
    playEvents(batch.events);
  }, [batch, playEvents]);

  return { rootRef, fxLayerRef, playEvents };
}
