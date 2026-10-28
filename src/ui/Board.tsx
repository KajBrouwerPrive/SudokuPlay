import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { BOXES, DIGITS, columnOf, rowOf } from "../engine";
import "./Board.css";
import type { CellView } from "./controls";
import { LongPressTracker } from "./longPress";

/** A short buzz confirms a long press on phones that support it. */
const LONG_PRESS_VIBRATION_MS = 12;

interface BoardProps {
  cells: CellView[];
  /** A click on a cell; `secondary` is the right mouse button or a long press on a touch screen. */
  onPress: (cell: number, secondary: boolean) => void;
  /** Layer over the board for temporary animation elements; React never renders into it. */
  fxLayerRef: Ref<HTMLDivElement>;
  /** Shown over the board, such as the solved card. */
  overlay?: ReactNode;
}

function cellClassName(view: CellView): string {
  const classes = ["cell"];
  if (view.given) classes.push("cell--given");
  if (view.peer) classes.push("cell--peer");
  if (view.sameDigit) classes.push("cell--same-digit");
  if (view.conflict) classes.push("cell--conflict");
  if (view.selected) classes.push("cell--selected");
  return classes.join(" ");
}

function cellLabel(cell: number, view: CellView): string {
  const position = `Rij ${rowOf(cell) + 1}, kolom ${columnOf(cell) + 1}`;
  if (view.value) return `${position}: ${view.value}${view.given ? " (gegeven)" : ""}`;
  return view.notes.length > 0 ? `${position}: leeg, notities ${view.notes.join(" ")}` : `${position}: leeg`;
}

/**
 * Moves the cursor over the selected cell. Positions are measured rather than computed, because
 * cells sit in box islands with different gaps. The first placement skips the glide, so the
 * cursor does not fly in from the corner.
 */
function useSelectionCursor(selected: number) {
  const boardRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const placedRef = useRef(false);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const cursor = cursorRef.current;
    if (!board || !cursor || selected < 0) {
      placedRef.current = false;
      return;
    }
    const place = (glide: boolean) => {
      const cell = board.querySelector<HTMLElement>(`[data-cell="${selected}"]`);
      if (!cell) return;
      if (!glide) cursor.style.transition = "none";
      Object.assign(cursor.style, {
        width: `${cell.offsetWidth}px`,
        height: `${cell.offsetHeight}px`,
        transform: `translate(${cell.offsetLeft}px, ${cell.offsetTop}px)`,
      });
      if (!glide) {
        // Commit the jump before the transition comes back.
        void cursor.offsetWidth;
        cursor.style.transition = "";
      }
    };
    place(placedRef.current);
    placedRef.current = true;
    // The observer reports once on start; only later reports are real resizes (rotation, window).
    let firstReport = true;
    const observer = new ResizeObserver(() => {
      if (firstReport) firstReport = false;
      else place(false);
    });
    observer.observe(board);
    return () => observer.disconnect();
  }, [selected]);

  return { boardRef, cursorRef };
}

export function Board({ cells, onPress, fxLayerRef, overlay }: BoardProps) {
  const selected = cells.findIndex((view) => view.selected);
  const { boardRef, cursorRef } = useSelectionCursor(selected);
  const [longPress] = useState(() => new LongPressTracker());
  useEffect(() => () => longPress.cancel(), [longPress]);
  return (
    <div className="board-frame">
      <div ref={boardRef} className="board" data-board role="group" aria-label="Sudoku">
        {BOXES.map((box) => (
          <div key={box.index} className="board__box">
            {box.cells.map((cell) => {
              const view = cells[cell];
              return (
                <button
                  key={cell}
                  type="button"
                  data-cell={cell}
                  className={cellClassName(view)}
                  aria-label={cellLabel(cell, view)}
                  onClick={() => {
                    if (!longPress.consumeClick()) onPress(cell, false);
                  }}
                  onContextMenu={(event) => {
                    // The right button notes the armed digit instead of opening the browser menu.
                    event.preventDefault();
                    if (!longPress.ownsContextMenu()) onPress(cell, true);
                  }}
                  onPointerDown={(event) =>
                    longPress.down(event, () => {
                      navigator.vibrate?.(LONG_PRESS_VIBRATION_MS);
                      onPress(cell, true);
                    })
                  }
                  onPointerMove={(event) => longPress.move(event)}
                  onPointerUp={() => longPress.cancel()}
                  onPointerLeave={() => longPress.cancel()}
                  onPointerCancel={() => longPress.cancel()}
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
              );
            })}
          </div>
        ))}
        {/* One cursor for the whole board, so a new selection glides there instead of jumping. */}
        {selected >= 0 && <div ref={cursorRef} className="selection-cursor" aria-hidden="true" />}
      </div>
      {overlay}
      <div ref={fxLayerRef} className="fx-layer" aria-hidden="true" />
    </div>
  );
}
