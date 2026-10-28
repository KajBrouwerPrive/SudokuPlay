import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Award, GameEvent } from "../engine";
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
 * Returns the refs to attach, `playEvents` for previewing effects without changing the game, and
 * `stopAll` to end every running effect (call it before starting a new game) and `setTimeScale`
 * for slow motion while tuning.
 */
export function useAnimations(batch: EventBatch | null, reducedMotion: boolean) {
  const rootRef = useRef<HTMLElement>(null);
  const fxLayerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<CuePlayer | null>(null);
  // StrictMode runs effects twice in development; remember what already played.
  const playedBatchRef = useRef<number | null>(null);
  const timeScaleRef = useRef(1);

  const player = useCallback((): CuePlayer | null => {
    if (!playerRef.current && rootRef.current && fxLayerRef.current) {
      playerRef.current = new CuePlayer(rootRef.current, fxLayerRef.current);
      playerRef.current.timeScale = timeScaleRef.current;
    }
    return playerRef.current;
  }, []);

  const playEvents = useCallback(
    (events: GameEvent[], reduced: boolean = reducedMotion, awards: Award[] = []) => player()?.play(choreograph(events, awards), reduced),
    [player, reducedMotion],
  );

  useLayoutEffect(() => {
    // Batch ids restart with each game, so forget what played.
    if (!batch) {
      playedBatchRef.current = null;
      return;
    }
    if (playedBatchRef.current === batch.id) return;
    playedBatchRef.current = batch.id;
    playEvents(batch.events, reducedMotion, batch.awards);
  }, [batch, playEvents, reducedMotion]);

  const stopAll = useCallback(() => playerRef.current?.finishAll(), []);

  const setTimeScale = useCallback(
    (scale: number) => {
      timeScaleRef.current = scale;
      const current = player();
      if (current) current.timeScale = scale;
    },
    [player],
  );

  return { rootRef, fxLayerRef, playEvents, stopAll, setTimeScale };
}
