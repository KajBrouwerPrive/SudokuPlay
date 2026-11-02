import { describe, expect, it } from "vitest";
import { CLASSIC_PUZZLE, CLASSIC_SOLUTION } from "../engine/__fixtures__/puzzles";
import { AwardReason, Difficulty, EMPTY, countEmpty, digitPoints, GameEventType, GameStatus, parseGrid, type Digit, type Puzzle } from "../engine";
import { CommandType, Direction, type Command } from "./controls";
import { GameOutcome } from "../stats/stats";
import { EVENT_LOG_LIMIT, SessionActionType, createSession, isAbandonable, sessionReducer, toGameRecord, type Session } from "./session";

const PUZZLE: Puzzle = { puzzle: parseGrid(CLASSIC_PUZZLE), solution: parseGrid(CLASSIC_SOLUTION), difficulty: Difficulty.Easy, seed: 7 };
/** The first correct digit's points, scaled to how many cells this puzzle leaves open. */
const FIRST_DIGIT_POINTS = Math.round(digitPoints(0, { difficulty: Difficulty.Easy, elapsedMs: 0, openCells: countEmpty(PUZZLE.puzzle) }));

const command = (session: Session, value: Command) => sessionReducer(session, { type: SessionActionType.Command, command: value });
const select = (session: Session, cell: number) => sessionReducer(session, { type: SessionActionType.Select, cell });
const arm = (session: Session, digit: Digit) => sessionReducer(session, { type: SessionActionType.ArmDigit, digit });
const press = (session: Session, cell: number, secondary = false) => sessionReducer(session, { type: SessionActionType.PressCell, cell, secondary });

/** Empty cells of the classic puzzle, in reading order. */
const EMPTY_CELLS = [...PUZZLE.puzzle.keys()].filter((cell) => PUZZLE.puzzle[cell] === EMPTY);

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
    expect(session.lastBatch).toMatchObject({ id: 1, events: session.log.map(({ event }) => event).reverse() });
    session = command(session, { type: CommandType.Undo });
    expect(session.game.values[2]).toBe(EMPTY);
    expect(session.log[0].event.type).toBe(GameEventType.MoveUndone);
    expect(session.lastBatch?.id).toBe(4);
  });

  it("keeps the last batch when an action produces no events", () => {
    let session = select(createSession(PUZZLE), 2);
    session = command(session, { type: CommandType.Input, digit: 4, asNote: false });
    const batch = session.lastBatch;
    expect(command(session, { type: CommandType.Input, digit: 4, asNote: false }).lastBatch).toBe(batch);
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

  describe("armed digit", () => {
    it("arms a pad digit, switches to another, and lets go on a second click or Escape", () => {
      let session = arm(createSession(PUZZLE), 4);
      expect(session.armedDigit).toBe(4);
      session = arm(session, 7);
      expect(session.armedDigit).toBe(7);
      expect(arm(session, 7).armedDigit).toBeNull();
      expect(command(session, { type: CommandType.Disarm }).armedDigit).toBeNull();
    });

    it("only selects a pressed cell while nothing is armed", () => {
      const session = press(createSession(PUZZLE), 2, true);
      expect(session.selected).toBe(2);
      expect(session.game.notes[2]).toBe(0);
      expect(session.lastBatch).toBeNull();
    });

    it("places the armed digit with a left click and notes it with a right click", () => {
      let session = arm(createSession(PUZZLE), 4);
      session = press(session, 2);
      expect(session.game.values[2]).toBe(4);
      expect(session.selected).toBe(2);
      session = press(session, 3, true);
      expect(session.game.values[3]).toBe(EMPTY);
      expect(session.lastBatch?.events).toEqual([{ type: GameEventType.NoteToggled, cell: 3, digit: 4, added: true }]);
      // A second right click takes the note away again.
      expect(press(session, 3, true).game.notes[3]).toBe(0);
    });

    it("notes with a left click in notes mode", () => {
      let session = command(arm(createSession(PUZZLE), 4), { type: CommandType.ToggleNotesMode });
      session = press(session, 2);
      expect(session.game.values[2]).toBe(EMPTY);
      expect(session.game.notes[2]).not.toBe(0);
    });

    it("only selects givens, so clicking around does not bonk", () => {
      const session = press(arm(createSession(PUZZLE), 4), 0);
      expect(session.selected).toBe(0);
      expect(session.lastBatch).toBeNull();
    });

    it("lets go of a digit once all nine are placed", () => {
      const solution = PUZZLE.solution;
      const cellsOfOne = EMPTY_CELLS.filter((cell) => solution[cell] === 1);
      let session = arm(createSession(PUZZLE), 1);
      for (const cell of cellsOfOne) session = press(session, cell);
      expect(session.lastBatch?.events.map((event) => event.type)).toContain(GameEventType.DigitCompleted);
      expect(session.armedDigit).toBeNull();
    });

    it("starts a new game with nothing armed", () => {
      expect(sessionReducer(arm(createSession(PUZZLE), 4), { type: SessionActionType.NewGame, puzzle: PUZZLE }).armedDigit).toBeNull();
    });
  });

  describe("game records", () => {
    it("counts a game as abandoned only after a move", () => {
      const fresh = createSession(PUZZLE);
      expect(isAbandonable(fresh)).toBe(false);
      expect(isAbandonable(command(select(fresh, 2), { type: CommandType.Input, digit: 4, asNote: false }))).toBe(true);
    });

    it("records difficulty, points, time, mistakes and hints", () => {
      let session = command(select(createSession(PUZZLE), 2), { type: CommandType.Input, digit: 4, asNote: false });
      session = sessionReducer(session, { type: SessionActionType.Tick, elapsedMs: 61_000.4 });
      const finishedAt = new Date(2026, 9, 28, 12, 0);
      expect(toGameRecord(session, GameOutcome.Abandoned, finishedAt)).toEqual({
        finishedAt: finishedAt.toISOString(),
        difficulty: Difficulty.Easy,
        seed: 7,
        points: FIRST_DIGIT_POINTS,
        mistakes: 0,
        hints: 0,
        durationMs: 61_000,
        outcome: GameOutcome.Abandoned,
      });
    });
  });

  describe("negative scores", () => {
    it("lets a mistake push the score below zero, but records zero", () => {
      const session = command(select(createSession(PUZZLE), 2), { type: CommandType.Input, digit: 5, asNote: false });
      expect(session.score.points).toBeLessThan(0);
      expect(toGameRecord(session, GameOutcome.Abandoned, new Date()).points).toBe(0);
    });
  });

  describe("score, time and hints", () => {
    it("scores a correct digit and reports the award with the batch", () => {
      const session = command(select(createSession(PUZZLE), 2), { type: CommandType.Input, digit: 4, asNote: false });
      expect(session.score.points).toBe(FIRST_DIGIT_POINTS);
      expect(session.lastBatch?.awards).toEqual([{ reason: AwardReason.Digit, points: FIRST_DIGIT_POINTS, cell: 2 }]);
    });

    it("counts play time only while playing", () => {
      let session = sessionReducer(createSession(PUZZLE), { type: SessionActionType.Tick, elapsedMs: 1500 });
      expect(session.elapsedMs).toBe(1500);
      session = { ...session, game: { ...session.game, status: GameStatus.Solved } };
      expect(sessionReducer(session, { type: SessionActionType.Tick, elapsedMs: 1000 }).elapsedMs).toBe(1500);
    });

    it("gives a hint in the selected cell and halves the points", () => {
      let session = command(select(createSession(PUZZLE), 2), { type: CommandType.Input, digit: 4, asNote: false });
      session = command(select(session, 3), { type: CommandType.Hint });
      expect(session.game.values[3]).toBe(PUZZLE.solution[3]);
      expect(session.score.points).toBe(FIRST_DIGIT_POINTS - Math.ceil(FIRST_DIGIT_POINTS / 2));
      expect(session.lastBatch?.events[0].type).toBe(GameEventType.HintUsed);
    });

    it("moves the selection to the cell a hint filled", () => {
      const session = command(select(createSession(PUZZLE), 0), { type: CommandType.Hint });
      const used = session.lastBatch?.events.find((event) => event.type === GameEventType.HintUsed);
      expect(used && "cell" in used ? used.cell : null).toBe(session.selected);
      expect(session.selected).not.toBe(0);
    });
  });
});
