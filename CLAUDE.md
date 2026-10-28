# SudokuPlay

A playful sudoku web app (PWA): Vite + React + TypeScript.

## Architecture
- `src/engine/` is the sudoku engine: pure TypeScript, no React or DOM imports. Keep it that way, so it stays testable and can move to a native app later.
- Grids are `Uint8Array(81)` in row-major order, `0` = empty. Candidates are 9-bit masks (`candidates.ts`).
- The UI and animation layer only react to engine output (state plus events, from the game reducer in a later phase); game rules never live in components.
- Randomness in the engine is always seeded, so puzzles and tests are reproducible.

## Checks
- Check command: `npm run check` (ESLint, type check of app and config, all Vitest tests). Run it once before saying work is done.
- Tests are Vitest, next to the code as `src/**/*.test.ts`. Puzzle fixtures live in `src/engine/__fixtures__/`. Use `fast-check` for properties that must hold for any puzzle.

## Git
- Work in a worktree under `.claude/worktrees/`, never in the main checkout. Install dependencies there only.
- Conventional commits, branch names `feat/...`, `fix/...`, `refactor/...`.

## Issues
- Tracked in the IssueTracker (`mcp__issues__*`). Project key: to be set once the project exists.
- Write tickets in Dutch; keep identifiers, paths and commands in backticks.
