// The game screen. Rules live in the engine, motion in src/animation; this only wires them together.
import { useEffect, useMemo, useReducer } from "react";
import { Control } from "./animation/choreograph";
import { useAnimations, usePrefersReducedMotion } from "./animation/useAnimations";
import { DIFFICULTIES, Difficulty, GameStatus, createPuzzle, remainingByDigit, type Digit } from "./engine";
import { Board } from "./ui/Board";
import { CommandType, cellViews, keyToCommand, type Command } from "./ui/controls";
import { DevPanel } from "./ui/DevPanel";
import { NumberPad } from "./ui/NumberPad";
import { SessionActionType, createSession, sessionReducer } from "./ui/session";

const SEED_PARAM = "seed";
const DIFFICULTY_PARAM = "difficulty";
const SEED_RANGE = 2 ** 32;

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
  const { game, selected, notesMode, log, lastBatch } = session;
  const reducedMotion = usePrefersReducedMotion();
  const { rootRef, fxLayerRef, playEvents, stopAll } = useAnimations(lastBatch, reducedMotion);
  const cells = useMemo(() => cellViews(game, selected), [game, selected]);
  const remaining = useMemo(() => remainingByDigit(game), [game]);

  useEffect(() => rememberInUrl(game.difficulty, game.seed), [game.difficulty, game.seed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement) return;
      const command = keyToCommand(event, notesMode);
      if (!command) return;
      event.preventDefault();
      dispatch({ type: SessionActionType.Command, command });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notesMode]);

  const run = (command: Command) => dispatch({ type: SessionActionType.Command, command });
  const startNewGame = (difficulty: Difficulty) => {
    stopAll();
    dispatch({ type: SessionActionType.NewGame, puzzle: createPuzzle({ difficulty, seed: randomSeed() }) });
  };

  return (
    <main className="app" ref={rootRef}>
      <header className="toolbar">
        <h1>SudokuPlay</h1>
        <label>
          Niveau{" "}
          <select value={game.difficulty} onChange={(event) => startNewGame(event.target.value as Difficulty)}>
            {DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {DIFFICULTY_LABELS[difficulty]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => startNewGame(game.difficulty)}>
          Nieuw spel
        </button>
      </header>

      <p className="status" role="status">
        Fouten: <span className="status__mistakes" data-control={Control.Mistakes}>{game.mistakes}</span> · Seed {game.seed}
      </p>

      <Board
        cells={cells}
        fxLayerRef={fxLayerRef}
        onSelect={(cell) => dispatch({ type: SessionActionType.Select, cell })}
        overlay={
          game.status === GameStatus.Solved && (
            <div className="solved-card" data-control={Control.SolvedCard} role="status">
              <strong className="solved-card__title">Opgelost!</strong>
              <span>
                {DIFFICULTY_LABELS[game.difficulty]} · {game.mistakes === 0 ? "zonder fouten" : `${game.mistakes} ${game.mistakes === 1 ? "fout" : "fouten"}`}
              </span>
              <button type="button" onClick={() => startNewGame(game.difficulty)}>
                Nog een
              </button>
            </div>
          )
        }
      />

      <NumberPad
        remaining={remaining}
        notesMode={notesMode}
        onDigit={(digit: Digit) => run({ type: CommandType.Input, digit, asNote: notesMode })}
        onErase={() => run({ type: CommandType.Erase })}
        onUndo={() => run({ type: CommandType.Undo })}
        onRedo={() => run({ type: CommandType.Redo })}
        onToggleNotes={() => run({ type: CommandType.ToggleNotesMode })}
      />

      <p className="hint">Toetsen: 1-9 plaatsen, Shift+cijfer notitie, N notitiemodus, pijltjes bewegen, Backspace wissen, Ctrl+Z / Ctrl+Y.</p>

      {import.meta.env.DEV && <DevPanel game={game} selected={selected} log={log} playEvents={playEvents} />}
    </main>
  );
}
