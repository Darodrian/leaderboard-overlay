import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  THEMES,
  cssVars,
  nextRotationWindow,
} from "./settings";

describe("mergeSettings", () => {
  it("preserves defaults for omitted keys", () => {
    const settings = mergeSettings({ display: { medals: false } });
    expect(settings.display.medals).toBe(false);
    expect(settings.display.bars).toBe(DEFAULT_SETTINGS.display.bars);
  });

  it("clamps opacity into 0..100", () => {
    expect(mergeSettings({ visuals: { opacity: 150 } }).visuals.opacity).toBe(100);
    expect(mergeSettings({ visuals: { opacity: -5 } }).visuals.opacity).toBe(0);
  });
});

describe("themes", () => {
  it("resolves a preset color", () =>
    expect(THEMES.midnight.background).toMatch(/^#/));

  it("lets overrides win", () => {
    const vars = cssVars({
      ...DEFAULT_SETTINGS,
      theme: { preset: "midnight", overrides: { "--lb-accent": "#ff0000" } },
    });
    expect(vars["--lb-accent"]).toBe("#ff0000");
  });
});

describe("nextRotationWindow", () => {
  it("cycles in order and wraps", () => {
    expect(nextRotationWindow("this_stream")).toBe("7d");
    expect(nextRotationWindow("alltime")).toBe("this_stream");
  });
});
