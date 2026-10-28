// The animation vocabulary: what each effect looks like, as Web Animations keyframes.
// Every effect animates only transform, opacity or box-shadow, so it stays smooth on phones.
// `reducedKeyframes` is the prefers-reduced-motion version: no movement, or null to skip it.

export const Effect = {
  /** A correct digit lands: squash and stretch. */
  Plop: "plop",
  /** A wrong digit lands: the same, but limp. */
  PlopWeak: "plopWeak",
  /** A ring spreads out from a correctly placed digit. */
  Ring: "ring",
  /** The number pad button of the placed digit hops. */
  PadHop: "padHop",
  /** A pencil mark removed by a placement floats away. */
  NoteBlowAway: "noteBlowAway",
  NotePopIn: "notePopIn",
  NotePopOut: "notePopOut",
  /** A clashing cell wobbles. */
  Wobble: "wobble",
  /** A clashing cell flashes red. */
  ConflictPulse: "conflictPulse",
  /** The mistake counter shakes. */
  CounterShake: "counterShake",
  /** An erased digit drops out of its cell. */
  DropOut: "dropOut",
  /** A cell whose notes were erased flashes once. */
  CellSweep: "cellSweep",
  /** Undo spins changed cells backwards, redo forwards. */
  RewindBackward: "rewindBackward",
  RewindForward: "rewindForward",
  /** A locked cell refuses a move. */
  Bonk: "bonk",
  /** A button refuses a press. */
  Wiggle: "wiggle",
  /** A completed row, column or box: each cell hops and glows as the wave passes. */
  Wave: "wave",
  /** A completed digit: every copy hops in turn. */
  DigitDance: "digitDance",
  /** The pad button of a completed digit squashes before it settles as done. */
  PadComplete: "padComplete",
  /** The solved board: every cell flips along the diagonal. */
  Flip: "flip",
  /** The solved board: confetti bursts from the board's centre. */
  Confetti: "confetti",
  /** The solved card springs in. */
  CardIn: "cardIn",
} as const;
export type Effect = (typeof Effect)[keyof typeof Effect];

/** Which element an effect moves. Ghosts are temporary copies for things already gone from the state. */
export const EffectPart = {
  /** The digit inside a cell. */
  Value: "value",
  /** The cell itself. */
  Cell: "cell",
  /** One pencil mark inside a cell. */
  Note: "note",
  /** A number pad button or another control. */
  Control: "control",
  GhostValue: "ghostValue",
  GhostNote: "ghostNote",
  GhostRing: "ghostRing",
  /** A full-screen canvas with particles; the keyframes only fade the canvas out. */
  Confetti: "confetti",
} as const;
export type EffectPart = (typeof EffectPart)[keyof typeof EffectPart];

export interface EffectSpec {
  part: EffectPart;
  durationMs: number;
  easing: string;
  keyframes: Keyframe[];
  reducedKeyframes: Keyframe[] | null;
}

/** A springy ease-out that overshoots slightly, written as CSS linear() stops. */
const SPRING_EASING = "linear(0, 0.25 8%, 0.74 20%, 1.06 34%, 1.1 40%, 1.02 55%, 0.99 70%, 1)";
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN_OUT = "ease-in-out";

const REDUCED_DURATION_MS = 150;
const CONFLICT_SHADOW = "inset 0 0 0 999px rgba(229, 57, 53, 0.35)";
const SWEEP_SHADOW = "inset 0 0 0 999px rgba(120, 160, 255, 0.3)";
const NO_SHADOW = "inset 0 0 0 999px rgba(0, 0, 0, 0)";
const WAVE_SHADOW = "inset 0 0 0 999px rgba(255, 196, 0, 0.35)";

const fadeIn: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const fadeOut: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }];
const blink: Keyframe[] = [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }];

export const EFFECTS: Readonly<Record<Effect, EffectSpec>> = {
  [Effect.Plop]: {
    part: EffectPart.Value,
    durationMs: 320,
    easing: EASE_OUT,
    keyframes: [
      { transform: "scale(0.2)", opacity: 0 },
      { transform: "scale(1.3, 0.8)", opacity: 1, offset: 0.4 },
      { transform: "scale(0.9, 1.12)", offset: 0.65 },
      { transform: "scale(1.04, 0.97)", offset: 0.85 },
      { transform: "scale(1)" },
    ],
    reducedKeyframes: fadeIn,
  },
  [Effect.PlopWeak]: {
    part: EffectPart.Value,
    durationMs: 240,
    easing: EASE_OUT,
    keyframes: [{ transform: "scale(0.6)", opacity: 0 }, { transform: "scale(1.05)", opacity: 1, offset: 0.6 }, { transform: "scale(1)" }],
    reducedKeyframes: fadeIn,
  },
  [Effect.Ring]: {
    part: EffectPart.GhostRing,
    durationMs: 480,
    easing: EASE_OUT,
    keyframes: [
      { transform: "scale(0.4)", opacity: 0.7 },
      { transform: "scale(1.7)", opacity: 0 },
    ],
    reducedKeyframes: null,
  },
  [Effect.PadHop]: {
    part: EffectPart.Control,
    durationMs: 260,
    easing: EASE_OUT,
    keyframes: [{ transform: "translateY(0)" }, { transform: "translateY(-7px)", offset: 0.4 }, { transform: "translateY(0)" }],
    reducedKeyframes: null,
  },
  [Effect.NoteBlowAway]: {
    part: EffectPart.GhostNote,
    durationMs: 480,
    easing: EASE_OUT,
    keyframes: [
      { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
      { transform: "translate(6px, -22px) rotate(25deg) scale(1.3)", opacity: 0 },
    ],
    reducedKeyframes: fadeOut,
  },
  [Effect.NotePopIn]: {
    part: EffectPart.Note,
    durationMs: 200,
    easing: SPRING_EASING,
    keyframes: [{ transform: "scale(0)" }, { transform: "scale(1)" }],
    reducedKeyframes: fadeIn,
  },
  [Effect.NotePopOut]: {
    part: EffectPart.GhostNote,
    durationMs: 160,
    easing: EASE_IN_OUT,
    keyframes: [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0)", opacity: 0 }],
    reducedKeyframes: fadeOut,
  },
  [Effect.Wobble]: {
    part: EffectPart.Value,
    durationMs: 450,
    easing: EASE_IN_OUT,
    keyframes: [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-14deg)", offset: 0.15 },
      { transform: "rotate(11deg)", offset: 0.35 },
      { transform: "rotate(-7deg)", offset: 0.55 },
      { transform: "rotate(4deg)", offset: 0.75 },
      { transform: "rotate(0deg)" },
    ],
    reducedKeyframes: null,
  },
  [Effect.ConflictPulse]: {
    part: EffectPart.Cell,
    durationMs: 600,
    easing: EASE_OUT,
    keyframes: [{ boxShadow: NO_SHADOW }, { boxShadow: CONFLICT_SHADOW, offset: 0.25 }, { boxShadow: NO_SHADOW }],
    reducedKeyframes: [{ boxShadow: NO_SHADOW }, { boxShadow: CONFLICT_SHADOW, offset: 0.25 }, { boxShadow: NO_SHADOW }],
  },
  [Effect.CounterShake]: {
    part: EffectPart.Control,
    durationMs: 380,
    easing: EASE_IN_OUT,
    keyframes: [
      { transform: "translateX(0) scale(1)" },
      { transform: "translateX(-5px) scale(1.2)", offset: 0.2 },
      { transform: "translateX(5px) scale(1.2)", offset: 0.4 },
      { transform: "translateX(-3px) scale(1.1)", offset: 0.6 },
      { transform: "translateX(2px) scale(1.05)", offset: 0.8 },
      { transform: "translateX(0) scale(1)" },
    ],
    reducedKeyframes: blink,
  },
  [Effect.DropOut]: {
    part: EffectPart.GhostValue,
    durationMs: 240,
    easing: EASE_IN_OUT,
    keyframes: [
      { transform: "translateY(0) scale(1)", opacity: 1 },
      { transform: "translateY(12px) scale(0.6)", opacity: 0 },
    ],
    reducedKeyframes: fadeOut,
  },
  [Effect.CellSweep]: {
    part: EffectPart.Cell,
    durationMs: 300,
    easing: EASE_OUT,
    keyframes: [{ boxShadow: SWEEP_SHADOW }, { boxShadow: NO_SHADOW }],
    reducedKeyframes: [{ boxShadow: SWEEP_SHADOW }, { boxShadow: NO_SHADOW }],
  },
  [Effect.RewindBackward]: {
    part: EffectPart.Cell,
    durationMs: 320,
    easing: EASE_OUT,
    keyframes: [{ transform: "perspective(300px) rotateY(0deg)" }, { transform: "perspective(300px) rotateY(-360deg)" }],
    reducedKeyframes: blink,
  },
  [Effect.RewindForward]: {
    part: EffectPart.Cell,
    durationMs: 320,
    easing: EASE_OUT,
    keyframes: [{ transform: "perspective(300px) rotateY(0deg)" }, { transform: "perspective(300px) rotateY(360deg)" }],
    reducedKeyframes: blink,
  },
  [Effect.Bonk]: {
    part: EffectPart.Value,
    durationMs: 240,
    easing: EASE_OUT,
    keyframes: [
      { transform: "scale(1) translateX(0)" },
      { transform: "scale(0.8) translateX(-2px)", offset: 0.3 },
      { transform: "scale(1.08) translateX(2px)", offset: 0.6 },
      { transform: "scale(1) translateX(0)" },
    ],
    reducedKeyframes: blink,
  },
  [Effect.Wiggle]: {
    part: EffectPart.Control,
    durationMs: 320,
    easing: EASE_IN_OUT,
    keyframes: [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-6deg)", offset: 0.25 },
      { transform: "rotate(5deg)", offset: 0.5 },
      { transform: "rotate(-3deg)", offset: 0.75 },
      { transform: "rotate(0deg)" },
    ],
    reducedKeyframes: null,
  },
  [Effect.Wave]: {
    part: EffectPart.Cell,
    durationMs: 420,
    easing: EASE_OUT,
    keyframes: [
      { transform: "translateY(0) scale(1)", boxShadow: NO_SHADOW },
      { transform: "translateY(-5px) scale(1.08)", boxShadow: WAVE_SHADOW, offset: 0.35 },
      { transform: "translateY(0) scale(1)", boxShadow: NO_SHADOW },
    ],
    reducedKeyframes: [{ boxShadow: NO_SHADOW }, { boxShadow: WAVE_SHADOW, offset: 0.35 }, { boxShadow: NO_SHADOW }],
  },
  [Effect.DigitDance]: {
    part: EffectPart.Value,
    durationMs: 380,
    easing: EASE_OUT,
    keyframes: [
      { transform: "translateY(0) rotate(0deg) scale(1)" },
      { transform: "translateY(-10px) rotate(-12deg) scale(1.25)", offset: 0.35 },
      { transform: "translateY(0) rotate(8deg) scale(0.95)", offset: 0.65 },
      { transform: "translateY(0) rotate(0deg) scale(1)" },
    ],
    reducedKeyframes: blink,
  },
  [Effect.PadComplete]: {
    part: EffectPart.Control,
    durationMs: 420,
    easing: EASE_OUT,
    keyframes: [
      { transform: "scale(1)" },
      { transform: "scale(1.25)", offset: 0.3 },
      { transform: "scale(0.85)", offset: 0.6 },
      { transform: "scale(1)" },
    ],
    reducedKeyframes: blink,
  },
  [Effect.Flip]: {
    part: EffectPart.Cell,
    durationMs: 520,
    easing: EASE_IN_OUT,
    keyframes: [{ transform: "perspective(300px) rotate3d(1, -1, 0, 0deg)" }, { transform: "perspective(300px) rotate3d(1, -1, 0, 360deg)" }],
    reducedKeyframes: blink,
  },
  [Effect.Confetti]: {
    part: EffectPart.Confetti,
    durationMs: 2800,
    easing: "linear",
    keyframes: [{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }],
    reducedKeyframes: null,
  },
  [Effect.CardIn]: {
    part: EffectPart.Control,
    durationMs: 520,
    easing: SPRING_EASING,
    keyframes: [
      { transform: "translateY(24px) scale(0.6)", opacity: 0 },
      { transform: "translateY(0) scale(1)", opacity: 1 },
    ],
    reducedKeyframes: fadeIn,
  },
};

/** The reduced version of an effect only fades or flashes, so it is always short. */
export function durationFor(effect: Effect, reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_DURATION_MS : EFFECTS[effect].durationMs;
}
