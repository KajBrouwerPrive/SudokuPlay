import { Control } from "../animation/choreograph";
import { DIGITS, type Digit } from "../engine";
import { EraserIcon, PencilIcon, RedoIcon, UndoIcon } from "./Icons";
import "./NumberPad.css";

/** Shown instead of the remaining count once all nine copies are placed. */
const DONE_MARK = "✓";

interface NumberPadProps {
  remaining: Record<Digit, number>;
  notesMode: boolean;
  onDigit: (digit: Digit) => void;
  onErase: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleNotes: () => void;
}

export function NumberPad({ remaining, notesMode, onDigit, onErase, onUndo, onRedo, onToggleNotes }: NumberPadProps) {
  return (
    <div className={notesMode ? "pad pad--notes" : "pad"}>
      <div className="pad__tools">
        <button type="button" className="pad__tool" data-control={Control.Undo} onClick={onUndo}>
          <UndoIcon />
          <span>Ongedaan</span>
        </button>
        <button type="button" className="pad__tool" data-control={Control.Redo} onClick={onRedo}>
          <RedoIcon />
          <span>Opnieuw</span>
        </button>
        <button type="button" className="pad__tool" onClick={onErase}>
          <EraserIcon />
          <span>Wissen</span>
        </button>
        <button type="button" className="pad__tool pad__tool--toggle" aria-pressed={notesMode} onClick={onToggleNotes}>
          <PencilIcon />
          <span>Notities</span>
          <span className="pad__switch" aria-hidden="true" />
        </button>
      </div>
      <div className="pad__digits">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            data-pad={digit}
            className={remaining[digit] === 0 ? "pad__digit pad__digit--done" : "pad__digit"}
            disabled={remaining[digit] === 0}
            aria-label={remaining[digit] === 0 ? `${digit}, klaar` : `${digit}, nog ${remaining[digit]}`}
            onClick={() => onDigit(digit)}
          >
            <span className="pad__value">{digit}</span>
            <span className="pad__remaining">{remaining[digit] === 0 ? DONE_MARK : remaining[digit]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
