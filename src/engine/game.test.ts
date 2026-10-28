import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION } from "./__fixtures__/puzzles";
import { digitBit } from "./candidates";
import {
  ActionType,
  GameEventType,
  GameStatus,
  MAX_HISTORY,
  RejectReason,
  applyAction,
  createGame,
  remainingByDigit,
  type GameAction,
  type GameEvent,
  type GameState,
} from "./game";
import { Difficulty } from "./grader";
import { CELL_COUNT, COLUMNS, EMPTY, ROWS, formatGrid, parseGrid, type Digit } from "./grid";

// Classic puzzle, row 0: 5 3 . | . 7 . | . . .   solution row 0: 5 3 4 | 6 7 8 | 9 1 2
const OPEN_CELL = 2;
const SOLUTION = parseGrid(CLASSIC_SOLUTION);

function newGame(): GameState {
  return createGame({ puzzle: parseGrid(CLASSIC_PUZZLE), solution: SOLUTION, difficulty: Difficulty.Easy, seed: 0 });
}

const place = (cell: number, digit: Digit): GameAction => ({ type: ActionType.Place, cell, digit });
const note = (cell: number, digit: Digit): GameAction => ({ type: ActionType.ToggleNote, cell, digit });
const erase = (cell: number): GameAction => ({ type: ActionType.Erase, cell });
const UNDO: GameAction = { type: ActionType.Undo };
const REDO: GameAction = { type: ActionType.Redo };

/** Applies actions in order and returns the final state plus the events of the last action. */
function play(state: GameState, ...actions: GameAction[]): { state: GameState; events: GameEvent[] } {
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyAction(state, action));
  return { state, events };
}

function correctPlacements(state: GameState, cells: readonly number[]): GameAction[] {
  return cells.filter((cell) => state.values[cell] === EMPTY).map((cell) => place(cell, SOLUTION[cell] as Digit));
}

const eventTypes = (events: GameEvent[]) => events.map((event) => event.type);

describe("createGame", () => {
  it("starts from the givens with nothing else set", () => {
    const state = newGame();
    expect(formatGrid(state.values)).toBe(CLASSIC_PUZZLE);
    expect(state).toMatchObject({ mistakes: 0, status: GameStatus.Playing, undoStack: [], redoStack: [] });
    expect(state.notes.every((mask) => mask === 0)).toBe(true);
  });

  it("counts the digits still to place", () => {
    const remaining = remainingByDigit(newGame());
    // The classic puzzle gives three 5s; the solution has nine.
    expect(remaining[5]).toBe(6);
    expect(Object.values(remaining).reduce((sum, count) => sum + count, 0)).toBe(51);
  });
});

describe("placing digits", () => {
  it("places a correct digit", () => {
    const { state, events } = applyAction(newGame(), place(OPEN_CELL, 4));
    expect(state.values[OPEN_CELL]).toBe(4);
    expect(events).toEqual([{ type: GameEventType.CellPlaced, cell: OPEN_CELL, digit: 4, correct: true }]);
    expect(remainingByDigit(state)[4]).toBe(remainingByDigit(newGame())[4] - 1);
  });

  it("counts a wrong digit as a mistake even without a visible conflict", () => {
    const { state, events } = applyAction(newGame(), place(OPEN_CELL, 1));
    expect(state.mistakes).toBe(1);
    expect(events).toEqual([
      { type: GameEventType.CellPlaced, cell: OPEN_CELL, digit: 1, correct: false },
      { type: GameEventType.MistakeMade, cell: OPEN_CELL, digit: 1, mistakes: 1 },
    ]);
  });

  it("reports the peers a conflicting digit clashes with", () => {
    const { events } = applyAction(newGame(), place(OPEN_CELL, 5));
    expect(eventTypes(events)).toEqual([GameEventType.CellPlaced, GameEventType.ConflictDetected, GameEventType.MistakeMade]);
    expect(events[1]).toMatchObject({ conflictingCells: [0] });
  });

  it("rejects changing a given and leaves the state untouched", () => {
    const before = newGame();
    const { state, events } = applyAction(before, place(0, 1));
    expect(state).toBe(before);
    expect(events).toEqual([{ type: GameEventType.MoveRejected, action: place(0, 1), reason: RejectReason.GivenCell, cell: 0 }]);
  });

  it("ignores placing the digit a cell already holds", () => {
    const placed = applyAction(newGame(), place(OPEN_CELL, 4)).state;
    const { state, events } = applyAction(placed, place(OPEN_CELL, 4));
    expect(state).toBe(placed);
    expect(events).toEqual([]);
  });

  it("removes the digit from the notes of its peers only", () => {
    // Cell 3 shares the row, 11 the box, 74 the column; 40 shares nothing with cell 2.
    const withNotes = play(newGame(), note(3, 4), note(11, 4), note(74, 4), note(40, 4), note(3, 2)).state;
    const { state, events } = applyAction(withNotes, place(OPEN_CELL, 4));
    expect(events[1]).toEqual({ type: GameEventType.NotesCleared, digit: 4, cells: [3, 11, 74] });
    expect(state.notes[3]).toBe(digitBit(2));
    expect(state.notes[40]).toBe(digitBit(4));
  });
});

describe("completion events", () => {
  it("completes a row on its last correct digit", () => {
    const game = newGame();
    const actions = correctPlacements(game, ROWS[0].cells);
    const beforeLast = play(game, ...actions.slice(0, -1));
    expect(eventTypes(beforeLast.events)).not.toContain(GameEventType.UnitCompleted);
    const { events } = applyAction(beforeLast.state, actions.at(-1)!);
    expect(events.filter((event) => event.type === GameEventType.UnitCompleted)).toEqual([{ type: GameEventType.UnitCompleted, unit: ROWS[0] }]);
  });

  it("does not complete a unit filled with a wrong digit", () => {
    const game = newGame();
    const actions = correctPlacements(game, COLUMNS[2].cells);
    const last = actions.at(-1) as Extract<GameAction, { type: typeof ActionType.Place }>;
    const wrongDigit = (last.digit === 9 ? 1 : last.digit + 1) as Digit;
    const { events } = play(game, ...actions.slice(0, -1), place(last.cell, wrongDigit));
    expect(eventTypes(events)).not.toContain(GameEventType.UnitCompleted);
  });

  it("completes a digit when its ninth copy is placed correctly", () => {
    const game = newGame();
    const cellsOfOne = Array.from({ length: CELL_COUNT }, (_, cell) => cell).filter((cell) => SOLUTION[cell] === 1);
    const actions = correctPlacements(game, cellsOfOne);
    expect(eventTypes(play(game, ...actions.slice(0, -1)).events)).not.toContain(GameEventType.DigitCompleted);
    expect(play(game, ...actions).events).toContainEqual({ type: GameEventType.DigitCompleted, digit: 1 });
  });

  it("ends with the full choreography on the last cell, then refuses further moves", () => {
    const game = newGame();
    const actions = correctPlacements(game, Array.from({ length: CELL_COUNT }, (_, cell) => cell));
    const { state, events } = play(game, ...actions);
    expect(state.status).toBe(GameStatus.Solved);
    expect(eventTypes(events)).toEqual([
      GameEventType.CellPlaced,
      GameEventType.UnitCompleted,
      GameEventType.UnitCompleted,
      GameEventType.UnitCompleted,
      GameEventType.DigitCompleted,
      GameEventType.PuzzleSolved,
    ]);
    expect(applyAction(state, UNDO).events).toEqual([{ type: GameEventType.MoveRejected, action: UNDO, reason: RejectReason.GameOver, cell: null }]);
  });
});

describe("notes and erasing", () => {
  it("toggles a note on and off", () => {
    const added = applyAction(newGame(), note(OPEN_CELL, 4));
    expect(added.events).toEqual([{ type: GameEventType.NoteToggled, cell: OPEN_CELL, digit: 4, added: true }]);
    const removed = applyAction(added.state, note(OPEN_CELL, 4));
    expect(removed.events).toEqual([{ type: GameEventType.NoteToggled, cell: OPEN_CELL, digit: 4, added: false }]);
    expect(removed.state.notes[OPEN_CELL]).toBe(0);
  });

  it("refuses notes on filled cells", () => {
    expect(applyAction(newGame(), note(0, 4)).events[0]).toMatchObject({ reason: RejectReason.GivenCell });
    const placed = applyAction(newGame(), place(OPEN_CELL, 4)).state;
    expect(applyAction(placed, note(OPEN_CELL, 1)).events[0]).toMatchObject({ reason: RejectReason.CellFilled });
  });

  it("erases a digit first, then notes, then does nothing", () => {
    const placed = play(newGame(), place(OPEN_CELL, 1)).state;
    const erasedDigit = applyAction(placed, erase(OPEN_CELL));
    expect(erasedDigit.events).toEqual([{ type: GameEventType.CellErased, cell: OPEN_CELL, digit: 1 }]);
    expect(erasedDigit.state.values[OPEN_CELL]).toBe(EMPTY);
    expect(erasedDigit.state.mistakes).toBe(1);

    const withNotes = play(erasedDigit.state, note(OPEN_CELL, 2), note(OPEN_CELL, 4)).state;
    const erasedNotes = applyAction(withNotes, erase(OPEN_CELL));
    expect(erasedNotes.events).toEqual([{ type: GameEventType.CellErased, cell: OPEN_CELL, digit: null }]);
    expect(erasedNotes.state.notes[OPEN_CELL]).toBe(0);

    expect(applyAction(erasedNotes.state, erase(OPEN_CELL))).toEqual({ state: erasedNotes.state, events: [] });
    expect(applyAction(newGame(), erase(0)).events[0]).toMatchObject({ reason: RejectReason.GivenCell });
  });
});

describe("undo and redo", () => {
  it("restores the value and the peer notes a placement cleared, but keeps the mistake", () => {
    const withNote = play(newGame(), note(3, 1)).state;
    const placed = applyAction(withNote, place(OPEN_CELL, 1)).state;
    const { state, events } = applyAction(placed, UNDO);
    expect(state.values[OPEN_CELL]).toBe(EMPTY);
    expect(state.notes[3]).toBe(digitBit(1));
    expect(state.mistakes).toBe(1);
    expect(events).toEqual([{ type: GameEventType.MoveUndone, changedCells: [OPEN_CELL, 3] }]);
  });

  it("redoes an undone move, and a new move clears the redo stack", () => {
    const placed = applyAction(newGame(), place(OPEN_CELL, 4)).state;
    const undone = applyAction(placed, UNDO).state;
    const redone = applyAction(undone, REDO);
    expect(redone.state.values[OPEN_CELL]).toBe(4);
    expect(redone.events).toEqual([{ type: GameEventType.MoveRedone, changedCells: [OPEN_CELL] }]);

    const branched = applyAction(undone, place(3, 6)).state;
    expect(applyAction(branched, REDO).events[0]).toMatchObject({ reason: RejectReason.NothingToRedo });
  });

  it("rejects undo with no history", () => {
    expect(applyAction(newGame(), UNDO).events[0]).toMatchObject({ reason: RejectReason.NothingToUndo });
  });

  it("keeps at most MAX_HISTORY undo steps", () => {
    const toggles = Array.from({ length: MAX_HISTORY + 5 }, () => note(OPEN_CELL, 4));
    expect(play(newGame(), ...toggles).state.undoStack).toHaveLength(MAX_HISTORY);
  });
});

describe("input validation", () => {
  it("throws on a cell or digit out of range", () => {
    expect(() => applyAction(newGame(), place(81, 1))).toThrow(RangeError);
    expect(() => applyAction(newGame(), place(0, 0 as Digit))).toThrow(RangeError);
  });
});

describe("properties over random play", () => {
  const cell = fc.integer({ min: 0, max: CELL_COUNT - 1 });
  const digit = fc.integer({ min: 1, max: 9 }).map((value) => value as Digit);
  const action: fc.Arbitrary<GameAction> = fc.oneof(
    fc.record({ type: fc.constant(ActionType.Place), cell, digit }),
    fc.record({ type: fc.constant(ActionType.Erase), cell }),
    fc.record({ type: fc.constant(ActionType.ToggleNote), cell, digit }),
    fc.constant(UNDO),
    fc.constant(REDO),
  );

  it("never changes givens or earlier states, never lowers mistakes, and undo restores the board", () => {
    fc.assert(
      fc.property(fc.array(action, { maxLength: 60 }), (actions) => {
        let state = newGame();
        for (const next of actions) {
          const valuesBefore = formatGrid(state.values);
          const notesBefore = [...state.notes];
          const result = applyAction(state, next);
          const changedBoard = result.state.undoStack.length > state.undoStack.length;
          if (formatGrid(state.values) !== valuesBefore || state.notes.some((mask, index) => mask !== notesBefore[index])) return false;
          if (result.state.mistakes < state.mistakes) return false;
          if (!result.state.givens.every((given, index) => given === EMPTY || result.state.values[index] === given)) return false;
          if (next.type !== ActionType.Undo && next.type !== ActionType.Redo && changedBoard) {
            const undone = applyAction(result.state, UNDO).state;
            if (formatGrid(undone.values) !== valuesBefore || undone.notes.some((mask, index) => mask !== notesBefore[index])) return false;
          }
          state = result.state;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
