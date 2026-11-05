// The game screen and the statistics page. Rules live in the engine, motion in src/animation;
// this only wires them together.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Control } from "./animation/choreograph";
import { useAnimations, usePrefersReducedMotion } from "./animation/useAnimations";
import { DIFFICULTIES, Difficulty, GameEventType, GameStatus, countEmpty, createPuzzle, multiplierFor, remainingByDigit, scoreBreakdown, type Digit } from "./engine";
import { GameOutcome } from "./stats/stats";
import { loadStats, recordGame } from "./stats/storage";
import { Board } from "./ui/Board";
import { CommandType, cellViews, keyToCommand, type Command } from "./ui/controls";
import { DevPanel } from "./ui/DevPanel";
import { formatDuration, formatMultiplier, formatPoints } from "./ui/format";
import { ChartIcon } from "./ui/Icons";
import { NumberPad } from "./ui/NumberPad";
import { ScoreBreakdownPanel } from "./ui/ScoreBreakdownPanel";
import { SessionActionType, createSession, isAbandonable, sessionReducer, toGameRecord, type Session } from "./ui/session";
import { StatsPage } from "./ui/StatsPage";
import { useHintConfirm } from "./ui/useHintConfirm";
import { usePlayTimer } from "./ui/usePlayTimer";

const SEED_PARAM = "seed";
const DIFFICULTY_PARAM = "difficulty";
const SEED_RANGE = 2 ** 32;
const STATS_HASH = "#stats";

const View = {
  Game: "game",
  Stats: "stats",
} as const;
type View = (typeof View)[keyof typeof View];

const viewFromUrl = (): View => (window.location.hash === STATS_HASH ? View.Stats : View.Game);

const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  [Difficulty.Easy]: "Makkelijk",
  [Difficulty.Medium]: "Gemiddeld",
  [Difficulty.Hard]: "Moeilijk",
  [Difficulty.Expert]: "Expert",
};

function randomSeed(): number {
  return Math.floor(Math.random() * SEED_RANGE);
}

/** Reads ?difficulty=&seed= so a puzzle can be shared or replayed while testing. */
function initialPuzzleOptions(): { difficulty: Difficulty; seed: number } {
  const params = new URLSearchParams(window.location.search);
  const difficulty = DIFFICULTIES.find((level) => level === params.get(DIFFICULTY_PARAM)) ?? Difficulty.Easy;
  const seed = Number(params.get(SEED_PARAM));
  return { difficulty, seed: Number.isInteger(seed) && seed > 0 ? seed : randomSeed() };
}

function rememberInUrl(difficulty: Difficulty, seed: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set(DIFFICULTY_PARAM, difficulty);
  url.searchParams.set(SEED_PARAM, String(seed));
  window.history.replaceState(null, "", url);
}

export function App() {
  const [session, dispatch] = useReducer(sessionReducer, undefined, () => createSession(createPuzzle(initialPuzzleOptions())));
  const { game, selected, notesMode, armedDigit, score, elapsedMs, log, lastBatch } = session;
  const reducedMotion = usePrefersReducedMotion();
  const { rootRef, fxLayerRef, playEvents, stopAll, setTimeScale } = useAnimations(lastBatch, reducedMotion);
  const cells = useMemo(() => cellViews(game, selected, armedDigit), [game, selected, armedDigit]);
  const remaining = useMemo(() => remainingByDigit(game), [game]);

  useEffect(() => rememberInUrl(game.difficulty, game.seed), [game.difficulty, game.seed]);

  const onElapsed = useCallback((ms: number) => dispatch({ type: SessionActionType.Tick, elapsedMs: ms }), []);
  const giveHint = useCallback(() => dispatch({ type: SessionActionType.Command, command: { type: CommandType.Hint } }), []);
  const hint = useHintConfirm(giveHint);
  const openCells = useMemo(() => countEmpty(game.givens), [game.givens]);
  const multiplier = multiplierFor(score.combo, openCells);
  // Only the developer panel uses it; recomputed every tick so the time bonus counts down live.
  const breakdown = import.meta.env.DEV ? scoreBreakdown(score, { difficulty: game.difficulty, elapsedMs, openCells }) : null;

  // The page has two views; the game stays mounted (hidden) on the stats page, so nothing is lost.
  const [view, setView] = useState<View>(viewFromUrl);
  const [stats, setStats] = useState(loadStats);
  // Fresh numbers every time the stats page opens, whether by button or by browser history.
  const showView = useCallback((next: View) => {
    if (next === View.Stats) setStats(loadStats());
    setView(next);
  }, []);
  useEffect(() => {
    const onPopState = () => showView(viewFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [showView]);
  const navigate = (next: View) => {
    const url = new URL(window.location.href);
    url.hash = next === View.Stats ? STATS_HASH : "";
    window.history.pushState(null, "", url);
    showView(next);
  };
  // The clock only runs while the game is on screen.
  usePlayTimer(game.status === GameStatus.Playing && view === View.Game, onElapsed);

  // Every finished game goes into the statistics: solved when the PuzzleSolved event arrives,
  // abandoned when a new game starts or the page closes after at least one move.
  const sessionRef = useRef<Session>(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const recordedBatchRef = useRef<number | null>(null);
  useEffect(() => {
    if (!lastBatch || recordedBatchRef.current === lastBatch.id) return;
    if (!lastBatch.events.some((event) => event.type === GameEventType.PuzzleSolved)) return;
    recordedBatchRef.current = lastBatch.id;
    recordGame(toGameRecord(sessionRef.current, GameOutcome.Solved, new Date()));
  }, [lastBatch]);
  useEffect(() => {
    const onPageHide = () => {
      if (isAbandonable(sessionRef.current)) recordGame(toGameRecord(sessionRef.current, GameOutcome.Abandoned, new Date()));
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement || view !== View.Game) return;
      const command = keyToCommand(event, notesMode);
      if (!command) return;
      event.preventDefault();
      if (command.type === CommandType.Hint) hint.request();
      else dispatch({ type: SessionActionType.Command, command });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notesMode, hint, view]);

  const run = (command: Command) => dispatch({ type: SessionActionType.Command, command });
  const startNewGame = (difficulty: Difficulty) => {
    if (isAbandonable(session)) recordGame(toGameRecord(session, GameOutcome.Abandoned, new Date()));
    stopAll();
    dispatch({ type: SessionActionType.NewGame, puzzle: createPuzzle({ difficulty, seed: randomSeed() }) });
  };

  return (
    <>
      {view === View.Stats && (
        <StatsPage stats={stats} difficultyLabels={DIFFICULTY_LABELS} reducedMotion={reducedMotion} onBack={() => navigate(View.Game)} />
      )}
      <main className="app" ref={rootRef} hidden={view !== View.Game}>
        <header className="toolbar">
          <h1>
            Sudoku<span>Play</span>
          </h1>
          <button type="button" className="button--icon" aria-label="Statistieken" title="Statistieken" onClick={() => navigate(View.Stats)}>
            <ChartIcon />
          </button>
          <button type="button" className="button--primary" onClick={() => startNewGame(game.difficulty)}>
            Nieuw spel
          </button>
        </header>

        <div className="game-bar">
          <label>
            <span className="visually-hidden">Niveau</span>
            <select value={game.difficulty} onChange={(event) => startNewGame(event.target.value as Difficulty)}>
              {DIFFICULTIES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {DIFFICULTY_LABELS[difficulty]}
                </option>
              ))}
            </select>
          </label>
          <p className="status" role="status">
            <span className={score.points < 0 ? "status__chip status__chip--score status__chip--alert" : "status__chip status__chip--score"}>
              <span className="status__points" data-control={Control.Score}>
                {formatPoints(score.points)}
              </span>{" "}
              punten
              {multiplier > 1 && <span className="status__combo">{formatMultiplier(multiplier)}</span>}
            </span>
            <span className={game.mistakes > 0 ? "status__chip status__chip--alert" : "status__chip"}>
              Fouten{" "}
              <span className="status__mistakes" data-control={Control.Mistakes}>
                {game.mistakes}
              </span>
            </span>
            <span className="status__chip status__time" aria-label="Speeltijd">
              {formatDuration(elapsedMs)}
            </span>
            {import.meta.env.DEV && <span className="status__chip">Seed {game.seed}</span>}
          </p>
        </div>

        <Board
          cells={cells}
          fxLayerRef={fxLayerRef}
          onPress={(cell, secondary) => dispatch({ type: SessionActionType.PressCell, cell, secondary })}
          overlay={
            game.status === GameStatus.Solved && (
              <div className="solved-card" data-control={Control.SolvedCard} role="status">
                <strong className="solved-card__title">Opgelost!</strong>
                <span className="solved-card__points">{formatPoints(score.points)} punten</span>
                <span>
                  {DIFFICULTY_LABELS[game.difficulty]} · {formatDuration(elapsedMs)} ·{" "}
                  {game.mistakes === 0 ? "zonder fouten" : `${game.mistakes} ${game.mistakes === 1 ? "fout" : "fouten"}`}
                  {game.hints > 0 && ` · ${game.hints} ${game.hints === 1 ? "hint" : "hints"}`}
                </span>
                <button type="button" className="button--primary" onClick={() => startNewGame(game.difficulty)}>
                  Nog een
                </button>
              </div>
            )
          }
        />

        <NumberPad
          remaining={remaining}
          notesMode={notesMode}
          armedDigit={armedDigit}
          onDigit={(digit: Digit) => dispatch({ type: SessionActionType.ArmDigit, digit })}
          onErase={() => run({ type: CommandType.Erase })}
          onUndo={() => run({ type: CommandType.Undo })}
          onRedo={() => run({ type: CommandType.Redo })}
          onToggleNotes={() => run({ type: CommandType.ToggleNotesMode })}
          hintConfirming={hint.confirming}
          onHint={hint.request}
        />

        <p className="hint">
          Muis: kies onderin een cijfer, dan linksklik (of tik) plaatsen en rechtsklik (of lang indrukken) notitie (Esc laat los). Toetsen: 1-9 plaatsen, Shift+cijfer notitie,
          N notitiemodus, pijltjes bewegen, Backspace wissen, Ctrl+Z / Ctrl+Y.
        </p>

        {breakdown && <ScoreBreakdownPanel breakdown={breakdown} solved={game.status === GameStatus.Solved} />}
        {import.meta.env.DEV && <DevPanel game={game} selected={selected} log={log} playEvents={playEvents} setTimeScale={setTimeScale} />}
      </main>
    </>
  );
}
