// Known puzzles for tests. Strings use "." for empty cells.

/** The example puzzle from the Wikipedia article on sudoku, with its unique solution. */
export const CLASSIC_PUZZLE =
  "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
export const CLASSIC_SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

/** Arto Inkala's 2012 puzzle, often called the hardest for human solvers. */
export const INKALA_PUZZLE =
  "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..";

/** A puzzle with only 17 givens, the minimum for a unique solution (first entry of Gordon Royle's list). */
export const SEVENTEEN_CLUE_PUZZLE =
  "000000010400000000020000000000050407008000300001090000300400200050100000000806000";

const CELL_COUNT = 81;
const GRID_SIZE = 9;

/** No duplicate givens, but cell 8 (row 0, column 8) has no candidate left: 1-8 fill the row, 9 is below it. */
export const UNSOLVABLE_PUZZLE = ("12345678." + "9".padStart(GRID_SIZE, ".")).padEnd(CELL_COUNT, ".");

/** Two 5s in the first row. */
export const INVALID_PUZZLE = "55".padEnd(CELL_COUNT, ".");

export const EMPTY_PUZZLE = ".".repeat(CELL_COUNT);
