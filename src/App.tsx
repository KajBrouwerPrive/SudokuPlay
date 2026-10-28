// Playground (phase 4): a plain board to play and test the engine by hand. No animations yet.
import { useEffect, useMemo, useReducer } from "react";
import { DIFFICULTIES, Difficulty, GameStatus, createPuzzle, remainingByDigit, type Digit } from "./engine";
import { Board } from "./ui/Board";
import { CommandType, cellViews, keyToCommand, type Command } from "./ui/controls";
import { EventLog } from "./ui/EventLog";
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
  const { game, selected, notesMode, log } = session;
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
  const startNewGame = (difficulty: Difficulty) =>
    dispatch({ type: SessionActionType.NewGame, puzzle: createPuzzle({ difficulty, seed: randomSeed() }) });

  return (
    <main className="app">
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
        Fouten: {game.mistakes} · Seed {game.seed}
        {game.status === GameStatus.Solved && <strong> · Opgelost!</strong>}
      </p>

      <Board cells={cells} onSelect={(cell) => dispatch({ type: SessionActionType.Select, cell })} />

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

      <EventLog log={log} />
    </main>
  );
}
