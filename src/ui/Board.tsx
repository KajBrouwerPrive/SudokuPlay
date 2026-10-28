import type { ReactNode, Ref } from "react";
import { BOX_SIZE, DIGITS, columnOf, rowOf } from "../engine";
import type { CellView } from "./controls";

interface BoardProps {
  cells: CellView[];
  onSelect: (cell: number) => void;
  /** Layer over the board for temporary animation elements; React never renders into it. */
  fxLayerRef: Ref<HTMLDivElement>;
  /** Shown over the board, such as the solved card. */
  overlay?: ReactNode;
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

export function Board({ cells, onSelect, fxLayerRef, overlay }: BoardProps) {
  return (
    <div className="board-frame">
      <div className="board" data-board role="group" aria-label="Sudoku">
        {cells.map((view, cell) => (
          <button
            key={cell}
            type="button"
            data-cell={cell}
            className={cellClassName(cell, view)}
            aria-label={cellLabel(cell, view)}
            onClick={() => onSelect(cell)}
          >
            {view.value ? (
              // Keyed by digit so a new digit gets a fresh element to animate.
              <span key={view.value} className="cell__value">
                {view.value}
              </span>
            ) : (
              <span className="notes" aria-hidden="true">
                {DIGITS.map((digit) => (
                  <span key={digit} data-note-digit={view.notes.includes(digit) ? digit : undefined}>
                    {view.notes.includes(digit) ? digit : ""}
                  </span>
                ))}
              </span>
            )}
          </button>
        ))}
      </div>
      {overlay}
      <div ref={fxLayerRef} className="fx-layer" aria-hidden="true" />
    </div>
  );
}
