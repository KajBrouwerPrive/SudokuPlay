import { BOX_SIZE, DIGITS, columnOf, rowOf } from "../engine";
import type { CellView } from "./controls";

interface BoardProps {
  cells: CellView[];
  onSelect: (cell: number) => void;
}

function cellClassName(cell: number, view: CellView): string {
  const classes = ["cell"];
  if (view.given) classes.push("cell--given");
  if (view.peer) classes.push("cell--peer");
  if (view.sameDigit) classes.push("cell--same-digit");
  if (view.conflict) classes.push("cell--conflict");
  if (view.selected) classes.push("cell--selected");
  if (columnOf(cell) % BOX_SIZE === BOX_SIZE - 1) classes.push("cell--box-right");
  if (rowOf(cell) % BOX_SIZE === BOX_SIZE - 1) classes.push("cell--box-bottom");
  return classes.join(" ");
}

function cellLabel(cell: number, view: CellView): string {
  const position = `Rij ${rowOf(cell) + 1}, kolom ${columnOf(cell) + 1}`;
  if (view.value) return `${position}: ${view.value}${view.given ? " (gegeven)" : ""}`;
  return view.notes.length > 0 ? `${position}: leeg, notities ${view.notes.join(" ")}` : `${position}: leeg`;
}

export function Board({ cells, onSelect }: BoardProps) {
  return (
    <div className="board" role="group" aria-label="Sudoku">
      {cells.map((view, cell) => (
        <button key={cell} type="button" className={cellClassName(cell, view)} aria-label={cellLabel(cell, view)} onClick={() => onSelect(cell)}>
          {view.value ?? (
            <span className="notes" aria-hidden="true">
              {DIGITS.map((digit) => (
                <span key={digit}>{view.notes.includes(digit) ? digit : ""}</span>
              ))}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
