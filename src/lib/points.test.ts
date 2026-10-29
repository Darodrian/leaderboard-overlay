import { describe, it, expect } from "vitest";
import { computePoints, shouldCredit } from "./points";

const cfg = { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 };

describe("computePoints", () => {
  it("multiplies tip cents by per-cent rate", () =>
    expect(computePoints("tip", 1000, cfg)).toBe(1000));
  it("multiplies bits by per-bit rate", () =>
    expect(computePoints("bit", 100, cfg)).toBe(100));
  it("credits gift bundles by count", () =>
    expect(computePoints("gift", 5, cfg)).toBe(1500));
  it("credits raids by raider count", () =>
    expect(computePoints("raid", 20, cfg)).toBe(1000));
  it("never returns negative points", () =>
    expect(computePoints("tip", -50, cfg)).toBe(0));
  it("treats a missing rate as zero instead of NaN", () =>
    expect(
      computePoints("bit", 100, { tip: 100 } as unknown as typeof cfg),
    ).toBe(0));
  it("treats a non-numeric rate as zero", () =>
    expect(
      computePoints("raid", 5, { ...cfg, raid: "x" } as unknown as typeof cfg),
    ).toBe(0));
});

describe("shouldCredit", () => {
  it("ignores tips below the threshold", () =>
    expect(shouldCredit("tip", 99, 100)).toBe(false));
  it("credits tips at the threshold", () =>
    expect(shouldCredit("tip", 100, 100)).toBe(true));
  it("ignores zero tips when a threshold is set", () =>
    expect(shouldCredit("tip", 0, 100)).toBe(false));
  it("always credits non-tip events", () =>
    expect(shouldCredit("bit", 0, 100)).toBe(true));
});
