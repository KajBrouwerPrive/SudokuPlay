import { Control } from "../animation/choreograph";
import { DIGITS, type Digit } from "../engine";

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
    <div className="pad">
      <div className="pad__digits">
        {DIGITS.map((digit) => (
          <button key={digit} type="button" data-pad={digit} className="pad__digit" disabled={remaining[digit] === 0} onClick={() => onDigit(digit)}>
            <span className="pad__value">{digit}</span>
            <span className="pad__remaining">{remaining[digit]}</span>
          </button>
        ))}
      </div>
      <div className="pad__tools">
        <button type="button" data-control={Control.Undo} onClick={onUndo}>
          Ongedaan
        </button>
        <button type="button" data-control={Control.Redo} onClick={onRedo}>
          Opnieuw
        </button>
        <button type="button" onClick={onErase}>Wissen</button>
        <button type="button" aria-pressed={notesMode} className={notesMode ? "is-active" : undefined} onClick={onToggleNotes}>
          Notities {notesMode ? "aan" : "uit"}
        </button>
      </div>
    </div>
  );
}
