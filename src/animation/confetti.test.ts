import { describe, expect, it } from "vitest";
import { createRandom } from "../engine";
import { CONFETTI_COLORS, CONFETTI_COUNT, GRAVITY, MAX_FALL_SPEED, createBurst, stepParticles } from "./confetti";

const burst = () => createBurst(createRandom(42), 100, 200);

describe("confetti", () => {
  it("bursts upward from the origin in the palette colours", () => {
    const particles = burst();
    expect(particles).toHaveLength(CONFETTI_COUNT);
    for (const particle of particles) {
      expect([particle.x, particle.y]).toEqual([100, 200]);
      expect(particle.vy).toBeLessThan(0);
      expect(CONFETTI_COLORS).toContain(particle.color);
    }
  });

  it("is reproducible for a seed", () => {
    expect(burst()).toEqual(burst());
  });

  it("pulls particles down and slows them sideways", () => {
    const particles = burst();
    const before = particles.map(({ vx, vy }) => ({ vx, vy }));
    stepParticles(particles, 0.016);
    particles.forEach((particle, index) => {
      expect(particle.vy).toBeCloseTo(Math.min(before[index].vy + GRAVITY * 0.016, MAX_FALL_SPEED));
      expect(Math.abs(particle.vx)).toBeLessThan(Math.abs(before[index].vx) + 1e-9);
    });
  });

  it("caps the falling speed so paper flutters down", () => {
    const particles = burst();
    for (let frame = 0; frame < 200; frame++) stepParticles(particles, 0.016);
    for (const particle of particles) expect(particle.vy).toBe(MAX_FALL_SPEED);
  });

  it("clamps long frames so a hidden tab does not teleport particles", () => {
    const short = burst();
    const long = burst();
    stepParticles(short, 0.05);
    stepParticles(long, 5);
    expect(long).toEqual(short);
  });
});
