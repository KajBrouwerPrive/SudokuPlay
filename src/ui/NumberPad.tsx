import { Control } from "../animation/choreograph";
import { DIGITS, type Digit } from "../engine";
import { BulbIcon, EraserIcon, PencilIcon, RedoIcon, UndoIcon } from "./Icons";
import "./NumberPad.css";

/** Shown instead of the remaining count once all nine copies are placed. */
const DONE_MARK = "✓";

interface NumberPadProps {
  remaining: Record<Digit, number>;
  notesMode: boolean;
  /** The digit picked for placing by clicking cells; its key stays lit. */
  armedDigit: Digit | null;
  onDigit: (digit: Digit) => void;
  onErase: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleNotes: () => void;
  /** True while the hint key waits for a second press to confirm. */
  hintConfirming: boolean;
  onHint: () => void;
}

export function NumberPad({ remaining, notesMode, armedDigit, onDigit, onErase, onUndo, onRedo, onToggleNotes, hintConfirming, onHint }: NumberPadProps) {
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
        <button
          type="button"
          className={hintConfirming ? "pad__tool pad__tool--hint pad__tool--confirming" : "pad__tool pad__tool--hint"}
          aria-live="polite"
          onClick={onHint}
        >
          <BulbIcon />
          <span>{hintConfirming ? "Zeker? ÷2" : "Hint"}</span>
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
            aria-pressed={armedDigit === digit}
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
