import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  applySettings,
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

  it("applies a partial over the current values", () => {
    const base = mergeSettings({ display: { medals: false } });
    const next = applySettings(base, { visuals: { opacity: 50 } });
    expect(next.display.medals).toBe(false);
    expect(next.visuals.opacity).toBe(50);
  });

  it("replaces theme overrides so a cleared color is removed", () => {
    const base = applySettings(DEFAULT_SETTINGS, {
      theme: { overrides: { "--lb-bg": "#111111" } },
    });
    expect(base.theme.overrides["--lb-bg"]).toBe("#111111");

    const next = applySettings(base, { theme: { overrides: {} } });
    expect(next.theme.overrides).toEqual({});
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

  it("exposes a rank color that overrides the theme accent", () => {
    const base = cssVars(DEFAULT_SETTINGS);
    expect(base["--lb-rank"]).toBe(THEMES.midnight.accent);

    const overridden = cssVars({
      ...DEFAULT_SETTINGS,
      theme: {
        preset: "midnight",
        overrides: { "--lb-rank": "#00ff00" },
      },
    });
    expect(overridden["--lb-rank"]).toBe("#00ff00");
  });
});

describe("nextRotationWindow", () => {
  it("cycles in order and wraps", () => {
    expect(nextRotationWindow("this_stream")).toBe("7d");
    expect(nextRotationWindow("alltime")).toBe("this_stream");
  });
});
