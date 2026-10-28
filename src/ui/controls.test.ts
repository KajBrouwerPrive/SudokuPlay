import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION } from "../engine/__fixtures__/puzzles";
import { ActionType, Difficulty, applyAction, createGame, parseGrid } from "../engine";
import { CommandType, Direction, cellViews, inputAction, keyToCommand, moveSelection, type KeyInput } from "./controls";

const NO_MODIFIERS = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false };
const key = (pressed: string, code = "", modifiers: Partial<KeyInput> = {}): KeyInput => ({ key: pressed, code, ...NO_MODIFIERS, ...modifiers });

describe("keyToCommand", () => {
  it("asks for a hint with H", () => {
    expect(keyToCommand(key("h", "KeyH"), false)).toEqual({ type: CommandType.Hint });
  });

  it("lets go of the armed digit on Escape", () => {
    expect(keyToCommand(key("Escape", "Escape"), false)).toEqual({ type: CommandType.Disarm });
  });

  it("repeats moves and undo/redo while a key is held, but not inputs or toggles", () => {
    const held = { repeat: true };
    expect(keyToCommand(key("ArrowRight", "", held), false)).toEqual({ type: CommandType.Move, direction: Direction.Right });
    expect(keyToCommand(key("z", "KeyZ", { ...held, ctrlKey: true }), false)).toEqual({ type: CommandType.Undo });
    expect(keyToCommand(key("5", "Digit5", held), true)).toBeNull();
    expect(keyToCommand(key("n", "KeyN", held), false)).toBeNull();
    expect(keyToCommand(key("Backspace", "", held), false)).toBeNull();
  });

  it("places digits, or notes them in notes mode", () => {
    expect(keyToCommand(key("5", "Digit5"), false)).toEqual({ type: CommandType.Input, digit: 5, asNote: false });
    expect(keyToCommand(key("5", "Numpad5"), true)).toEqual({ type: CommandType.Input, digit: 5, asNote: true });
  });

  it("flips the mode for one digit with Shift, reading the physical key", () => {
    expect(keyToCommand(key("%", "Digit5", { shiftKey: true }), false)).toEqual({ type: CommandType.Input, digit: 5, asNote: true });
    expect(keyToCommand(key("%", "Digit5", { shiftKey: true }), true)).toEqual({ type: CommandType.Input, digit: 5, asNote: false });
  });

  it("maps arrows, erase keys and the notes toggle", () => {
    expect(keyToCommand(key("ArrowLeft"), false)).toEqual({ type: CommandType.Move, direction: Direction.Left });
    for (const erase of ["Backspace", "Delete", "0"]) expect(keyToCommand(key(erase), false)).toEqual({ type: CommandType.Erase });
    expect(keyToCommand(key("N"), false)).toEqual({ type: CommandType.ToggleNotesMode });
  });

  it("maps undo and redo with Ctrl or Cmd", () => {
    expect(keyToCommand(key("z", "KeyZ", { ctrlKey: true }), false)).toEqual({ type: CommandType.Undo });
    expect(keyToCommand(key("Z", "KeyZ", { metaKey: true, shiftKey: true }), false)).toEqual({ type: CommandType.Redo });
    expect(keyToCommand(key("y", "KeyY", { ctrlKey: true }), false)).toEqual({ type: CommandType.Redo });
  });

  it("ignores other keys and browser shortcuts", () => {
    expect(keyToCommand(key("a"), false)).toBeNull();
    expect(keyToCommand(key("5", "Digit5", { ctrlKey: true }), false)).toBeNull();
    expect(keyToCommand(key("5", "Digit5", { altKey: true }), false)).toBeNull();
  });
});

describe("moveSelection", () => {
  it("moves one cell and wraps at the edges", () => {
    expect(moveSelection(40, Direction.Up)).toBe(31);
    expect(moveSelection(0, Direction.Up)).toBe(72);
    expect(moveSelection(8, Direction.Right)).toBe(0);
    expect(moveSelection(72, Direction.Left)).toBe(80);
    expect(moveSelection(80, Direction.Down)).toBe(8);
  });
});

describe("inputAction", () => {
  it("turns input into a place or note action", () => {
    expect(inputAction(3, 7, false)).toEqual({ type: ActionType.Place, cell: 3, digit: 7 });
    expect(inputAction(3, 7, true)).toEqual({ type: ActionType.ToggleNote, cell: 3, digit: 7 });
  });
});

describe("cellViews", () => {
  const game = createGame({ puzzle: parseGrid(CLASSIC_PUZZLE), solution: parseGrid(CLASSIC_SOLUTION), difficulty: Difficulty.Easy, seed: 0 });

  it("marks givens and nothing else without a selection", () => {
    const views = cellViews(game, null);
    expect(views[0]).toEqual({ value: 5, notes: [], given: true, hinted: false, selected: false, peer: false, sameDigit: false, highlightedNote: null, conflict: false });
    expect(views[2]).toMatchObject({ value: null, given: false });
  });

  it("highlights the selection, its peers and the same digit elsewhere", () => {
    const views = cellViews(game, 0);
    expect(views[0].selected).toBe(true);
    expect(views.filter((view) => view.peer)).toHaveLength(20);
    // The classic puzzle shows 5 at cells 0, 14 and 71 (row 7, column 8).
    expect(views.flatMap((view, cell) => (view.sameDigit ? [cell] : []))).toEqual([0, 14, 71]);
  });

  it("highlights the armed digit instead of the selected cell's digit", () => {
    const views = cellViews(game, 0, 3);
    expect(views.flatMap((view, cell) => (view.sameDigit ? [cell] : []))).toEqual(
      [...game.values.keys()].filter((cell) => game.values[cell] === 3),
    );
    expect(views[0].sameDigit).toBe(false);
  });

  it("lights up notes of the highlighted digit, armed or selected", () => {
    let state = applyAction(game, { type: ActionType.ToggleNote, cell: 2, digit: 4 }).state;
    state = applyAction(state, { type: ActionType.ToggleNote, cell: 2, digit: 1 }).state;
    expect(cellViews(state, null, 4)[2].highlightedNote).toBe(4);
    expect(cellViews(state, null, 7)[2].highlightedNote).toBeNull();
    expect(cellViews(state, null)[2].highlightedNote).toBeNull();
    // Cell 1 holds a given 3; selecting it lights up the 3 notes too.
    state = applyAction(state, { type: ActionType.ToggleNote, cell: 2, digit: 3 }).state;
    expect(cellViews(state, 1)[2].highlightedNote).toBe(3);
  });

  it("shows notes in empty cells and marks conflicts", () => {
    let state = applyAction(game, { type: ActionType.ToggleNote, cell: 2, digit: 4 }).state;
    state = applyAction(state, { type: ActionType.ToggleNote, cell: 2, digit: 1 }).state;
    expect(cellViews(state, null)[2].notes).toEqual([1, 4]);
    state = applyAction(state, { type: ActionType.Place, cell: 2, digit: 5 }).state;
    const views = cellViews(state, null);
    expect(views[2]).toMatchObject({ value: 5, notes: [], conflict: true });
    expect(views[0].conflict).toBe(true);
  });
});
