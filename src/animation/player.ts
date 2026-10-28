// Executes cues on the DOM with the Web Animations API. Elements are found through data attributes
// (data-cell, data-note-digit, data-pad, data-control), so components stay unaware of animations.
// Ghosts (copies of things already gone from the state) live in a separate fx layer over the
// board that React never renders into.
import { BOX_SIZE } from "../engine";
import { TargetKind, type Cue, type CueTarget } from "./choreograph";
import { EFFECTS, EffectPart, durationFor } from "./effects";

const VALUE_SELECTOR = ".cell__value";
const GHOST_CLASS: Readonly<Partial<Record<EffectPart, string>>> = {
  [EffectPart.GhostValue]: "fx-ghost fx-ghost--value",
  [EffectPart.GhostNote]: "fx-ghost fx-ghost--note",
  [EffectPart.GhostRing]: "fx-ring",
};

function selectorFor(target: CueTarget): string {
  switch (target.kind) {
    case TargetKind.Cell:
    case TargetKind.Note:
      return `[data-cell="${target.cell}"]`;
    case TargetKind.Pad:
      return `[data-pad="${target.digit}"]`;
    case TargetKind.Control:
      return `[data-control="${target.control}"]`;
  }
}

export class CuePlayer {
  private readonly running = new Set<Animation>();

  constructor(
    private readonly root: HTMLElement,
    private readonly fxLayer: HTMLElement,
  ) {}

  /** Starts a new set of cues, first jumping anything still running to its end so moves never pile up. */
  play(cues: readonly Cue[], reducedMotion: boolean): void {
    this.finishAll();
    for (const cue of cues) this.playCue(cue, reducedMotion);
  }

  finishAll(): void {
    for (const animation of [...this.running]) animation.finish();
    this.running.clear();
  }

  private playCue(cue: Cue, reducedMotion: boolean): void {
    const spec = EFFECTS[cue.effect];
    const keyframes = reducedMotion ? spec.reducedKeyframes : spec.keyframes;
    if (!keyframes) return;
    const anchor = this.root.querySelector<HTMLElement>(selectorFor(cue.target));
    if (!anchor) return;
    const ghostClass = GHOST_CLASS[spec.part];
    const element = ghostClass ? this.createGhost(anchor, cue, ghostClass) : this.partOf(anchor, cue);
    if (!element) return;

    const animation = element.animate(keyframes, {
      duration: durationFor(cue.effect, reducedMotion),
      delay: cue.delayMs,
      easing: reducedMotion ? "ease-out" : spec.easing,
      // Show the first keyframe during the delay, so a delayed ghost does not flash in its end state.
      fill: "backwards",
    });
    this.running.add(animation);
    const cleanUp = () => {
      this.running.delete(animation);
      if (ghostClass) element.remove();
    };
    animation.finished.then(cleanUp, cleanUp);
  }

  private partOf(cell: HTMLElement, cue: Cue): HTMLElement | null {
    const spec = EFFECTS[cue.effect];
    if (spec.part === EffectPart.Value) return cell.querySelector<HTMLElement>(VALUE_SELECTOR);
    if (spec.part === EffectPart.Note && cue.target.kind === TargetKind.Note) {
      return cell.querySelector<HTMLElement>(`[data-note-digit="${cue.target.digit}"]`);
    }
    return cell;
  }

  /** Places a temporary element over the target in the fx layer: a whole cell, or one note's slot. */
  private createGhost(anchor: HTMLElement, cue: Cue, className: string): HTMLElement {
    const layerBox = this.fxLayer.getBoundingClientRect();
    const box = anchor.getBoundingClientRect();
    let left = box.left - layerBox.left;
    let top = box.top - layerBox.top;
    let width = box.width;
    let height = box.height;
    if (cue.target.kind === TargetKind.Note) {
      const slot = cue.target.digit - 1;
      width = box.width / BOX_SIZE;
      height = box.height / BOX_SIZE;
      left += (slot % BOX_SIZE) * width;
      top += Math.floor(slot / BOX_SIZE) * height;
    }
    const ghost = document.createElement("div");
    ghost.className = className;
    ghost.textContent = cue.label ?? "";
    Object.assign(ghost.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    this.fxLayer.append(ghost);
    return ghost;
  }
}
