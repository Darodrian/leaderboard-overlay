import type {
  BoardConfig,
  BoardConfigs,
  BoardType,
  DisplayToggles,
  OverlaySettings,
  PointConfig,
  ScreenLayout,
  ThemePreset,
  WindowType,
} from "./types";

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  active: false,
  windows: ["this_stream", "7d", "30d", "alltime"],
  rankCount: 25,
};

export const DEFAULT_BOARDS: BoardConfigs = {
  points: { active: true, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 25 },
  donations: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
  bits: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
  subs: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
  raiders: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
  view_time: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
  chat_messages: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
  clips: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
};

export const ALL_BOARD_TYPES: BoardType[] = [
  "points",
  "donations",
  "bits",
  "subs",
  "raiders",
  "view_time",
  "chat_messages",
  "clips",
];

export const DEFAULT_SETTINGS: OverlaySettings = {  pointConfig: { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 },
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
  boards: DEFAULT_BOARDS,
  pointsSuffix: "pts",
  screenLayout: "single",
  rotationMode: "both",
  fontFamily: "system",
  labelAlignment: "center",
  excludeBroadcasterFromViewTime: false,
  excludeModsFromViewTime: false,
  excludeBroadcasterFromChatMessages: false,
  excludeModsFromChatMessages: false,
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
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
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    // Theme overrides and boards are complete maps: replacing the whole object
    // lets the dashboard clear a color or reset a board back to defaults.
    result[key] =
      key === "overrides" || key === "boards"
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

  const unknownDisplay = settings.display as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS.display) as (keyof DisplayToggles)[]) {
    if (typeof unknownDisplay[key] !== "boolean") {
      settings.display[key] = DEFAULT_SETTINGS.display[key];
    }
  }

  // Coerce new boolean toggles
  const boolDefaults = {
    excludeBroadcasterFromViewTime: DEFAULT_SETTINGS.excludeBroadcasterFromViewTime,
    excludeModsFromViewTime: DEFAULT_SETTINGS.excludeModsFromViewTime,
    excludeBroadcasterFromChatMessages: DEFAULT_SETTINGS.excludeBroadcasterFromChatMessages,
    excludeModsFromChatMessages: DEFAULT_SETTINGS.excludeModsFromChatMessages,
  } as const;
  for (const [key, defaultValue] of Object.entries(boolDefaults)) {
    if (typeof (settings as unknown as Record<string, unknown>)[key] !== "boolean") {
      (settings as unknown as Record<string, unknown>)[key] = defaultValue;
    }
  }

  const mask =
    typeof settings.anonymousMaskName === "string"
      ? settings.anonymousMaskName.trim()
      : "";
  settings.anonymousMaskName = mask || "Anonymous";

  const pointsSuffix =
    typeof settings.pointsSuffix === "string" ? settings.pointsSuffix : "pts";
  settings.pointsSuffix = pointsSuffix || "pts";

  if (
    settings.screenLayout !== "single" &&
    settings.screenLayout !== "side-by-side" &&
    settings.screenLayout !== "stacked"
  ) {
    settings.screenLayout = DEFAULT_SETTINGS.screenLayout;
  }

  if (
    settings.rotationMode !== "boards" &&
    settings.rotationMode !== "windows" &&
    settings.rotationMode !== "both"
  ) {
    settings.rotationMode = DEFAULT_SETTINGS.rotationMode;
  }

  if (
    settings.labelAlignment !== "left" &&
    settings.labelAlignment !== "center" &&
    settings.labelAlignment !== "right"
  ) {
    settings.labelAlignment = DEFAULT_SETTINGS.labelAlignment;
  }

  if (typeof settings.fontFamily !== "string" || settings.fontFamily.length === 0) {
    settings.fontFamily = DEFAULT_SETTINGS.fontFamily;
  }

  // Clamp boards: validate each board config
  const boards: Record<string, BoardConfig> = {};
  const allBoardTypes: BoardType[] = [
    "points",
    "donations",
    "bits",
    "subs",
    "raiders",
    "view_time",
    "chat_messages",
    "clips",
  ];

  for (const boardType of allBoardTypes) {
    const defaultBoard = DEFAULT_BOARDS[boardType] as BoardConfig;
    let boardCfg: BoardConfig | undefined;
    if (
      settings.boards &&
      typeof settings.boards === "object" &&
      !Array.isArray(settings.boards)
    ) {
      boardCfg = (settings.boards as Record<string, BoardConfig | undefined>)[
        boardType
      ];
    }

    boards[boardType] = {
      active: boardCfg?.active ?? defaultBoard.active,
      windows: boardCfg?.windows &&
        boardCfg.windows.length > 0 &&
        boardCfg.windows.every((w) =>
          ["this_stream", "7d", "30d", "alltime"].includes(w),
        )
        ? boardCfg.windows
        : defaultBoard.windows,
      rankCount:
        typeof boardCfg?.rankCount === "number" &&
        boardCfg.rankCount >= 1 &&
        boardCfg.rankCount <= 100
          ? boardCfg.rankCount
          : defaultBoard.rankCount,
    };
  }
  settings.boards = boards as BoardConfigs;

  const overrides: Record<string, string> = {};
  if (isPlainObject(settings.theme.overrides)) {
    for (const [key, value] of Object.entries(settings.theme.overrides)) {
      if (/^--lb-[a-z0-9-]+$/.test(key) && typeof value === "string") {
        overrides[key] = value;
      }
    }
  }
  settings.theme.overrides = overrides;

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
    "--lb-font-family": settings.fontFamily,
    "--lb-label-align": settings.labelAlignment,
    "--lb-points-suffix": settings.pointsSuffix,
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

export const BOARD_SYMBOLS: Record<BoardType, string> = {
  points: "pts",
  donations: "$",
  bits: "bit",
  subs: "sub",
  raiders: "raid",
  view_time: "⏱",
  chat_messages: "💬",
  clips: "🎥",
};

export const BOARD_LABELS: Record<BoardType, string> = {
  points: "Points",
  donations: "Donations",
  bits: "Bits",
  subs: "Subs",
  raiders: "Raiders",
  view_time: "View Time",
  chat_messages: "Chat",
  clips: "Clips",
};
