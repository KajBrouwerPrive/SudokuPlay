import { describe, expect, it } from "vitest";
import { formatDuration, formatMultiplier, formatPoints } from "./format";

describe("format", () => {
  it("shows play time as minutes and seconds, with hours when needed", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(247_900)).toBe("4:07");
    expect(formatDuration(3_729_000)).toBe("1:02:09");
    expect(formatDuration(-5)).toBe("0:00");
  });

  it("shows the combo multiplier with one decimal", () => {
    expect(formatMultiplier(1.4)).toBe("×1.4");
    expect(formatMultiplier(2)).toBe("×2.0");
  });

  it("groups thousands the Dutch way", () => {
    expect(formatPoints(12345)).toBe("12.345");
    expect(formatPoints(-1500)).toBe("−1.500");
  });
});
