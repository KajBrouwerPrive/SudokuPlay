// Development-only tools: preview every animation on the board without changing the game, and
// follow the raw engine events. Not rendered in production builds.
import { useState } from "react";
import { ActionType, GameEventType, PEERS, RejectReason, UNITS_OF_CELL, type Digit, type GameEvent, type GameState } from "../engine";
import { EventLog } from "./EventLog";
import type { LoggedEvent } from "./session";

/** Where previews play when no cell is selected: the centre. */
const DEFAULT_CELL = 40;
const DEFAULT_DIGIT: Digit = 5;

interface Preview {
  label: string;
  events: (cell: number, digit: Digit, game: GameState) => GameEvent[];
}

const placedWithUnits = (cell: number, digit: Digit): GameEvent[] => [
  { type: GameEventType.CellPlaced, cell, digit, correct: true },
  ...UNITS_OF_CELL[cell].map((unit): GameEvent => ({ type: GameEventType.UnitCompleted, unit })),
];

const digitCompleted = (digit: Digit, game: GameState): GameEvent => ({
  type: GameEventType.DigitCompleted,
  digit,
  cells: [...game.solution.keys()].filter((cell) => game.solution[cell] === digit),
});

const PREVIEWS: readonly Preview[] = [
  { label: "Goed geplaatst", events: (cell, digit) => [{ type: GameEventType.CellPlaced, cell, digit, correct: true }] },
  {
    label: "Notities waaien weg",
    events: (cell, digit) => [
      { type: GameEventType.CellPlaced, cell, digit, correct: true },
      { type: GameEventType.NotesCleared, digit, cells: [...PEERS[cell]] },
    ],
  },
  {
    label: "Fout + conflict",
    events: (cell, digit) => [
      { type: GameEventType.CellPlaced, cell, digit, correct: false },
      { type: GameEventType.ConflictDetected, cell, digit, conflictingCells: PEERS[cell].slice(0, 2) },
      { type: GameEventType.MistakeMade, cell, digit, mistakes: 1 },
    ],
  },
  { label: "Notitie erbij", events: (cell, digit) => [{ type: GameEventType.NoteToggled, cell, digit, added: true }] },
  { label: "Notitie eraf", events: (cell, digit) => [{ type: GameEventType.NoteToggled, cell, digit, added: false }] },
  { label: "Cijfer wissen", events: (cell, digit) => [{ type: GameEventType.CellErased, cell, digit }] },
  { label: "Notities wissen", events: (cell) => [{ type: GameEventType.CellErased, cell, digit: null }] },
  { label: "Undo", events: (cell) => [{ type: GameEventType.MoveUndone, changedCells: [cell, ...PEERS[cell].slice(0, 3)] }] },
  { label: "Redo", events: (cell) => [{ type: GameEventType.MoveRedone, changedCells: [cell, ...PEERS[cell].slice(0, 3)] }] },
  {
    label: "Bonk",
    events: (cell, digit) => [
      { type: GameEventType.MoveRejected, action: { type: ActionType.Place, cell, digit }, reason: RejectReason.GivenCell, cell },
    ],
  },
  { label: "Rij+kolom+blok compleet", events: placedWithUnits },
  { label: "Cijfer compleet", events: (cell, digit, game) => [{ type: GameEventType.CellPlaced, cell, digit, correct: true }, digitCompleted(digit, game)] },
  {
    label: "Finale",
    events: (cell, digit, game) => [...placedWithUnits(cell, digit), digitCompleted(digit, game), { type: GameEventType.PuzzleSolved, mistakes: game.mistakes }],
  },
  {
    label: "Niets te undoen",
    events: () => [{ type: GameEventType.MoveRejected, action: { type: ActionType.Undo }, reason: RejectReason.NothingToUndo, cell: null }],
  },
];

interface DevPanelProps {
  game: GameState;
  selected: number | null;
  log: LoggedEvent[];
  playEvents: (events: GameEvent[], reducedMotion: boolean) => void;
}

export function DevPanel({ game, selected, log, playEvents }: DevPanelProps) {
  const [reducedPreview, setReducedPreview] = useState(false);
  const cell = selected ?? DEFAULT_CELL;
  const digit = (game.values[cell] || DEFAULT_DIGIT) as Digit;
  return (
    <section className="dev-panel">
      <details open>
        <summary>Animatie-speeltuin (vakje {cell + 1}, cijfer {digit})</summary>
        <div className="dev-panel__buttons">
          {PREVIEWS.map((preview) => (
            <button key={preview.label} type="button" onClick={() => playEvents(preview.events(cell, digit, game), reducedPreview)}>
              {preview.label}
            </button>
          ))}
        </div>
        <label className="dev-panel__toggle">
          <input type="checkbox" checked={reducedPreview} onChange={(event) => setReducedPreview(event.target.checked)} /> Rustige modus
          (reduced motion)
        </label>
      </details>
      <EventLog log={log} />
    </section>
  );
}
