import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION } from "../engine/__fixtures__/puzzles";
import { Difficulty, EMPTY, GameEventType, parseGrid, type Puzzle } from "../engine";
import { CommandType, Direction, type Command } from "./controls";
import { EVENT_LOG_LIMIT, SessionActionType, createSession, sessionReducer, type Session } from "./session";

const PUZZLE: Puzzle = { puzzle: parseGrid(CLASSIC_PUZZLE), solution: parseGrid(CLASSIC_SOLUTION), difficulty: Difficulty.Easy, seed: 7 };

const command = (session: Session, value: Command) => sessionReducer(session, { type: SessionActionType.Command, command: value });
const select = (session: Session, cell: number) => sessionReducer(session, { type: SessionActionType.Select, cell });

describe("sessionReducer", () => {
  it("ignores input until a cell is selected", () => {
    const session = createSession(PUZZLE);
    expect(command(session, { type: CommandType.Input, digit: 4, asNote: false })).toBe(session);
    expect(command(session, { type: CommandType.Erase })).toBe(session);
  });

  it("starts arrow navigation from the centre", () => {
    expect(command(createSession(PUZZLE), { type: CommandType.Move, direction: Direction.Right }).selected).toBe(41);
  });

  it("places into the selected cell and logs the events newest first", () => {
    let session = select(createSession(PUZZLE), 2);
    session = command(session, { type: CommandType.Input, digit: 5, asNote: false });
    expect(session.game.values[2]).toBe(5);
    expect(session.log.map(({ id, event }) => [id, event.type])).toEqual([
      [3, GameEventType.MistakeMade],
      [2, GameEventType.ConflictDetected],
      [1, GameEventType.CellPlaced],
    ]);
    session = command(session, { type: CommandType.Undo });
    expect(session.game.values[2]).toBe(EMPTY);
    expect(session.log[0].event.type).toBe(GameEventType.MoveUndone);
  });

  it("caps the log", () => {
    let session = select(createSession(PUZZLE), 2);
    for (let toggle = 0; toggle < EVENT_LOG_LIMIT + 10; toggle++) session = command(session, { type: CommandType.Input, digit: 1, asNote: true });
    expect(session.log).toHaveLength(EVENT_LOG_LIMIT);
    expect(session.log[0].id).toBe(EVENT_LOG_LIMIT + 10);
  });

  it("toggles notes mode and keeps it across a new game", () => {
    const notes = command(createSession(PUZZLE), { type: CommandType.ToggleNotesMode });
    expect(notes.notesMode).toBe(true);
    const fresh = sessionReducer(select(notes, 2), { type: SessionActionType.NewGame, puzzle: PUZZLE });
    expect(fresh).toMatchObject({ notesMode: true, selected: null, log: [] });
  });
});
