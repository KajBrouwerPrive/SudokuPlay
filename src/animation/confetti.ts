// Confetti for the finale: a burst of paper bits with gravity and air drag, drawn on a canvas.
// The physics is plain data plus `stepParticles`, so it is tested without a DOM.
import type { Random } from "../engine";

export const CONFETTI_COLORS = ["#ff5a5f", "#ffb400", "#00a699", "#2457c5", "#8e44ad", "#7ed957"] as const;
export const CONFETTI_COUNT = 140;
/** Downward acceleration in px/s². */
export const GRAVITY = 900;
/** Fraction of horizontal speed kept per second. */
const HORIZONTAL_DRAG = 0.35;
/** Paper flutters: falling speed is capped. */
export const MAX_FALL_SPEED = 260;
const MIN_LAUNCH_SPEED = 350;
const MAX_LAUNCH_SPEED = 900;
/** Launch angles stay in the upper half, fanning out around straight up. */
const LAUNCH_SPREAD_RADIANS = Math.PI * 0.8;
const MIN_SIZE = 6;
const MAX_SIZE = 11;
const MAX_SPIN = 12;
/** Longer frames (a hidden tab) are clamped, so particles never jump. */
const MAX_FRAME_SECONDS = 0.05;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  /** Radians per second. */
  spin: number;
  size: number;
  color: string;
}

const between = (random: Random, min: number, max: number) => min + random.next() * (max - min);

export function createBurst(random: Random, originX: number, originY: number, count: number = CONFETTI_COUNT): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (random.next() - 0.5) * LAUNCH_SPREAD_RADIANS;
    const speed = between(random, MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED);
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: between(random, 0, Math.PI * 2),
      spin: between(random, -MAX_SPIN, MAX_SPIN),
      size: between(random, MIN_SIZE, MAX_SIZE),
      color: CONFETTI_COLORS[random.nextInt(CONFETTI_COLORS.length)],
    };
  });
}

/** Advances every particle by `seconds` in place; called once per frame. */
export function stepParticles(particles: Particle[], seconds: number): void {
  const dt = Math.min(Math.max(seconds, 0), MAX_FRAME_SECONDS);
  const drag = HORIZONTAL_DRAG ** dt;
  for (const particle of particles) {
    particle.vx *= drag;
    particle.vy = Math.min(particle.vy + GRAVITY * dt, MAX_FALL_SPEED);
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;
  }
}

export function drawParticles(context: CanvasRenderingContext2D, particles: readonly Particle[]): void {
  for (const particle of particles) {
    context.save();
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    // Squash by the rotation so the paper seems to tumble in 3D.
    context.scale(1, Math.cos(particle.rotation * 1.7));
    context.fillStyle = particle.color;
    context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
    context.restore();
  }
}

/**
 * Animates a burst on `canvas` (sized to the viewport) until `stop` is called. `localTimeMs`
 * reports the driving animation's time, so the burst waits out the cue's delay and stays in step
 * with its fade-out.
 */
export function runConfetti(canvas: HTMLCanvasElement, particles: Particle[], delayMs: number, localTimeMs: () => number): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  let frame = 0;
  let lastTime: number | null = null;
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (localTimeMs() < delayMs) return;
    if (lastTime !== null) stepParticles(particles, (now - lastTime) / 1000);
    lastTime = now;
    // Measured every frame: the viewport may change (rotation) or be empty while the tab is hidden.
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * pixelRatio);
    const height = Math.round(window.innerHeight * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawParticles(context, particles);
  };
  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
}
