import type {
  OverlaySettings,
  PointConfig,
  ThemePreset,
  WindowType,
} from "./types";

export const DEFAULT_SETTINGS: OverlaySettings = {
  pointConfig: { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 },
  tipThresholdCents: 0,
  anonymousMaskName: "Mystery Supporter",
  display: {
    ranks: true,
    medals: true,
    rankNumbers: true,
    bars: true,
    amounts: true,
  },
  hiddenAccounts: [],
  layout: { width: 420, padding: 12, borderRadius: 16 },
  visuals: { opacity: 100, fontSize: 18 },
  theme: { preset: "midnight", overrides: {} },
  rotation: { enabled: false, intervalMs: 30000 },
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer _U>
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type ThemeColors = {
  background: string;
  text: string;
  accent: string;
  bar: string;
};

export const THEMES: Record<ThemePreset, ThemeColors> = {
  midnight: {
    background: "#0b1020",
    text: "#e6edf3",
    accent: "#7c9cff",
    bar: "#2a3a6a",
  },
  ember: {
    background: "#1a0d08",
    text: "#ffe9d6",
    accent: "#ff7a45",
    bar: "#5a2a16",
  },
  mint: {
    background: "#07140f",
    text: "#dcfff0",
    accent: "#3ddc97",
    bar: "#14503a",
  },
  grape: {
    background: "#120a1f",
    text: "#f0e6ff",
    accent: "#b07cff",
    bar: "#3a2260",
  },
  paper: {
    background: "#f7f5ef",
    text: "#1f2328",
    accent: "#2f6feb",
    bar: "#d8d3c4",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(patch) || !isPlainObject(base)) return patch as T;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    // Theme overrides are a complete map, not a nested config: replacing the
    // whole object lets the dashboard clear a color back to the preset.
    result[key] =
      key === "overrides"
        ? value
        : isPlainObject(value) && isPlainObject(result[key])
          ? deepMerge(result[key], value)
          : value;
  }
  return result as T;
}

function clampNumber(value: unknown, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampSettings(settings: OverlaySettings): OverlaySettings {
  settings.visuals.opacity = clampNumber(settings.visuals.opacity, 0, 100);
  settings.visuals.fontSize = clampNumber(settings.visuals.fontSize, 8, 72);
  settings.layout.width = clampNumber(settings.layout.width, 200, 800);
  settings.layout.padding = clampNumber(settings.layout.padding, 0, 48);
  settings.layout.borderRadius = clampNumber(settings.layout.borderRadius, 0, 999);
  settings.rotation.intervalMs = clampNumber(settings.rotation.intervalMs, 3000, 300000);
  settings.tipThresholdCents = clampNumber(
    settings.tipThresholdCents,
    0,
    Number.MAX_SAFE_INTEGER,
  );

  for (const key of Object.keys(settings.pointConfig) as (keyof PointConfig)[]) {
    settings.pointConfig[key] = clampNumber(
      settings.pointConfig[key],
      0,
      Number.MAX_SAFE_INTEGER,
    );
  }

  return settings;
}

export function applySettings(
  current: OverlaySettings,
  partial: DeepPartial<OverlaySettings>,
): OverlaySettings {
  return clampSettings(deepMerge(structuredClone(current), partial));
}

export function mergeSettings(
  partial: DeepPartial<OverlaySettings>,
): OverlaySettings {
  return applySettings(DEFAULT_SETTINGS, partial);
}

export function cssVars(settings: OverlaySettings): Record<string, string> {
  const theme = THEMES[settings.theme.preset] ?? THEMES.midnight;

  return {
    "--lb-bg": theme.background,
    "--lb-text": theme.text,
    "--lb-accent": theme.accent,
    "--lb-rank": theme.accent,
    "--lb-bar": theme.bar,
    "--lb-width": `${settings.layout.width}px`,
    "--lb-padding": `${settings.layout.padding}px`,
    "--lb-radius": `${settings.layout.borderRadius}px`,
    "--lb-opacity": `${settings.visuals.opacity / 100}`,
    "--lb-font-size": `${settings.visuals.fontSize}px`,
    ...settings.theme.overrides,
  };
}

const ROTATION_ORDER: WindowType[] = ["this_stream", "7d", "30d", "alltime"];

export function nextRotationWindow(
  current: WindowType,
  order: WindowType[] = ROTATION_ORDER,
): WindowType {
  if (order.length === 0) return current;
  const index = order.indexOf(current);
  if (index === -1) return order[0];
  return order[(index + 1) % order.length];
}
