import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION } from "./__fixtures__/puzzles";
import {
  ActionType,
  GameEventType,
  GameStatus,
  RejectReason,
  applyAction,
  createGame,
  isHinted,
  type GameAction,
  type GameEvent,
  type GameState,
} from "./game";
import { Difficulty } from "./grader";
import { CELL_COUNT, EMPTY, cloneGrid, parseGrid, type Digit } from "./grid";
import { findHintTarget } from "./hint";
import { applyStep, createLogicState, findNextStep } from "./logic";

const PUZZLE = parseGrid(CLASSIC_PUZZLE);
const SOLUTION = parseGrid(CLASSIC_SOLUTION);
// Classic puzzle, row 0: 5 3 . | . 7 . | . . .   solution row 0: 5 3 4 | 6 7 8 | 9 1 2
const OPEN_CELL = 2;
const GIVEN_CELL = 0;

const newGame = (): GameState => createGame({ puzzle: PUZZLE, solution: SOLUTION, difficulty: Difficulty.Easy, seed: 0 });
const hint = (preferredCell: number | null = null): GameAction => ({ type: ActionType.Hint, preferredCell });

function play(state: GameState, ...actions: GameAction[]): { state: GameState; events: GameEvent[] } {
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyAction(state, action));
  return { state, events };
}

/** The first cell the logic solver itself would place on the bare puzzle. */
function firstLogicalPlacement(): number {
  const state = createLogicState(PUZZLE);
  for (;;) {
    const step = findNextStep(state);
    if (!step) throw new Error("the classic puzzle should be solvable by logic");
    if (step.placements.length > 0) return step.placements[0].cell;
    applyStep(state, step);
  }
}

describe("findHintTarget", () => {
  it("fills the preferred cell when it still needs its digit", () => {
    expect(findHintTarget(PUZZLE, SOLUTION, OPEN_CELL)).toEqual({ cell: OPEN_CELL, digit: 4 });
  });

  it("fixes a wrong digit in the preferred cell", () => {
    const values = cloneGrid(PUZZLE);
    values[OPEN_CELL] = 9;
    expect(findHintTarget(values, SOLUTION, OPEN_CELL)).toEqual({ cell: OPEN_CELL, digit: 4 });
  });

  it("otherwise picks the cell a human would find next", () => {
    const cell = firstLogicalPlacement();
    expect(findHintTarget(PUZZLE, SOLUTION, GIVEN_CELL)).toEqual({ cell, digit: SOLUTION[cell] });
    expect(findHintTarget(PUZZLE, SOLUTION, null)?.cell).toBe(cell);
  });

  it("ignores the player's wrong digits when looking for the next logical cell", () => {
    const values = cloneGrid(PUZZLE);
    values[OPEN_CELL] = 9;
    const target = findHintTarget(values, SOLUTION, null);
    expect(target).not.toBeNull();
    expect(target?.digit).toBe(SOLUTION[target?.cell ?? 0]);
  });

  it("returns null when the board is solved", () => {
    expect(findHintTarget(SOLUTION, SOLUTION, null)).toBeNull();
  });

  it("always targets a cell that still needs its digit", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: CELL_COUNT - 1 }), { maxLength: 40 }), (filled) => {
        const values = cloneGrid(PUZZLE);
        for (const cell of filled) values[cell] = SOLUTION[cell];
        const target = findHintTarget(values, SOLUTION, null);
        if (values.every((value, cell) => value === SOLUTION[cell])) return target === null;
        return target !== null && values[target.cell] !== SOLUTION[target.cell] && target.digit === SOLUTION[target.cell];
      }),
    );
  });
});

describe("the hint action", () => {
  it("announces the hint, then places the correct digit with the usual events", () => {
    const { state, events } = play(newGame(), hint(OPEN_CELL));
    expect(events[0]).toEqual({ type: GameEventType.HintUsed, cell: OPEN_CELL, digit: 4, hints: 1 });
    expect(events[1]).toEqual({ type: GameEventType.CellPlaced, cell: OPEN_CELL, digit: 4, correct: true });
    expect(state.values[OPEN_CELL]).toBe(4);
    expect(state.hints).toBe(1);
    expect(state.mistakes).toBe(0);
    expect(isHinted(state, OPEN_CELL)).toBe(true);
  });

  it("locks the hinted cell", () => {
    const { state } = play(newGame(), hint(OPEN_CELL));
    for (const action of [
      { type: ActionType.Place, cell: OPEN_CELL, digit: 1 as Digit },
      { type: ActionType.Erase, cell: OPEN_CELL },
    ] as const) {
      expect(applyAction(state, action).events).toEqual([{ type: GameEventType.MoveRejected, action, reason: RejectReason.HintedCell, cell: OPEN_CELL }]);
    }
  });

  it("can be undone, which unlocks the cell but keeps the hint counted", () => {
    const { state } = play(newGame(), hint(OPEN_CELL), { type: ActionType.Undo });
    expect(state.values[OPEN_CELL]).toBe(EMPTY);
    expect(isHinted(state, OPEN_CELL)).toBe(false);
    expect(state.hints).toBe(1);
    expect(isHinted(play(state, { type: ActionType.Redo }).state, OPEN_CELL)).toBe(true);
  });

  it("can solve the puzzle", () => {
    let state = newGame();
    const open = [...PUZZLE.keys()].filter((cell) => PUZZLE[cell] === EMPTY);
    for (let index = 0; index < open.length; index++) state = applyAction(state, hint()).state;
    expect(state.status).toBe(GameStatus.Solved);
    expect(state.hints).toBe(open.length);
    expect(applyAction(state, hint()).events[0]).toMatchObject({ type: GameEventType.MoveRejected, reason: RejectReason.GameOver });
  });

  it("rejects a preferred cell outside the board", () => {
    expect(() => applyAction(newGame(), hint(CELL_COUNT))).toThrow(RangeError);
  });
});
