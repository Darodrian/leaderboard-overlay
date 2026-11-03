export const DEFAULT_BOARDS = {
  points: { active: true, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
  donations: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
  bits: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
  subs: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
  raiders: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
  chat_messages: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
  clips: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
};

export const ALL_BOARD_TYPES = ['points', 'donations', 'bits', 'subs', 'raiders', 'chat_messages', 'clips'];

export const DEFAULT_SETTINGS = {
  pointConfig: { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 },
  tipThresholdCents: 0,
  anonymousMaskName: 'Mystery Supporter',
  display: { ranks: true, medals: true, rankNumbers: true, bars: true, amounts: true },
  hiddenAccounts: [],
  layout: { width: 420, padding: 12, borderRadius: 16 },
  visuals: { opacity: 100, fontSize: 18 },
  theme: { preset: 'midnight', overrides: {} },
  rotation: { enabled: false, intervalMs: 30000 },
  boards: DEFAULT_BOARDS,
  screenLayout: 'single',
  rotationMode: 'both',
  fontFamily: 'system',
  labelAlignment: 'center',
  boardLabels: {},
  excludeBroadcasterFromChatMessages: false,
  excludeModsFromChatMessages: false,
};

export const THEMES = {
  midnight: { background: '#0b1020', text: '#e6edf3', accent: '#7c9cff', bar: '#2a3a6a' },
  ember: { background: '#1a0d08', text: '#ffe9d6', accent: '#ff7a45', bar: '#5a2a16' },
  mint: { background: '#07140f', text: '#dcfff0', accent: '#3ddc97', bar: '#14503a' },
  grape: { background: '#120a1f', text: '#f0e6ff', accent: '#b07cff', bar: '#3a2260' },
  paper: { background: '#f7f5ef', text: '#1f2328', accent: '#2f6feb', bar: '#d8d3c4' },
};

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base, patch) {
  if (patch === undefined) return base;
  if (!isPlainObject(patch) || !isPlainObject(base)) return patch;

  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    result[key] =
      key === 'overrides' || key === 'boards' || key === 'boardLabels'
        ? value
        : isPlainObject(value) && isPlainObject(result[key])
          ? deepMerge(result[key], value)
          : value;
  }
  return result;
}

function clampNumber(value, min, max) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampSettings(settings) {
  settings.visuals.opacity = clampNumber(settings.visuals.opacity, 0, 100);
  settings.visuals.fontSize = clampNumber(settings.visuals.fontSize, 8, 72);
  settings.layout.width = clampNumber(settings.layout.width, 200, 1600);
  settings.layout.padding = clampNumber(settings.layout.padding, 0, 48);
  settings.layout.borderRadius = clampNumber(settings.layout.borderRadius, 0, 100);
  settings.rotation.intervalMs = clampNumber(settings.rotation.intervalMs, 3000, 300000);
  settings.tipThresholdCents = clampNumber(settings.tipThresholdCents, 0, Number.MAX_SAFE_INTEGER);

  for (const key of Object.keys(settings.pointConfig)) {
    settings.pointConfig[key] = clampNumber(settings.pointConfig[key], 0, Number.MAX_SAFE_INTEGER);
  }

  const unknownDisplay = settings.display;
  for (const key of Object.keys(DEFAULT_SETTINGS.display)) {
    if (typeof unknownDisplay[key] !== 'boolean') {
      settings.display[key] = DEFAULT_SETTINGS.display[key];
    }
  }

  const boolDefaults = {
    excludeBroadcasterFromChatMessages: DEFAULT_SETTINGS.excludeBroadcasterFromChatMessages,
    excludeModsFromChatMessages: DEFAULT_SETTINGS.excludeModsFromChatMessages,
  };
  for (const [key, defaultValue] of Object.entries(boolDefaults)) {
    if (typeof settings[key] !== 'boolean') {
      settings[key] = defaultValue;
    }
  }

  const mask = typeof settings.anonymousMaskName === 'string' ? settings.anonymousMaskName.trim() : '';
  settings.anonymousMaskName = mask || 'Anonymous';

  settings.hiddenAccounts = Array.isArray(settings.hiddenAccounts)
    ? settings.hiddenAccounts
        .filter((account) => typeof account === 'string')
        .map((account) => account.trim())
        .filter(Boolean)
    : [];

  if (
    settings.screenLayout !== 'single' &&
    settings.screenLayout !== 'stacked'
  ) {
    settings.screenLayout = DEFAULT_SETTINGS.screenLayout;
  }

  if (
    settings.rotationMode !== 'boards' &&
    settings.rotationMode !== 'windows' &&
    settings.rotationMode !== 'both'
  ) {
    settings.rotationMode = DEFAULT_SETTINGS.rotationMode;
  }

  if (typeof settings.fontFamily !== 'string' || settings.fontFamily.length === 0) {
    settings.fontFamily = DEFAULT_SETTINGS.fontFamily;
  }

  if (
    settings.labelAlignment !== 'left' &&
    settings.labelAlignment !== 'center' &&
    settings.labelAlignment !== 'right'
  ) {
    settings.labelAlignment = DEFAULT_SETTINGS.labelAlignment;
  }

  const boards = {};
  for (const boardType of ALL_BOARD_TYPES) {
    const defaultBoard = DEFAULT_BOARDS[boardType];
    let boardCfg;
    if (
      settings.boards &&
      typeof settings.boards === 'object' &&
      !Array.isArray(settings.boards)
    ) {
      boardCfg = settings.boards[boardType];
    }

    boards[boardType] = {
      active: boardCfg ? boardCfg.active : defaultBoard.active,
      windows: boardCfg &&
        boardCfg.windows.length > 0 &&
        boardCfg.windows.every((w) => ['this_stream', '7d', '30d', 'alltime'].includes(w))
        ? boardCfg.windows
        : defaultBoard.windows,
      rankCount:
        typeof boardCfg?.rankCount === 'number' &&
        boardCfg.rankCount >= 1 &&
        boardCfg.rankCount <= 100
          ? boardCfg.rankCount
          : defaultBoard.rankCount,
    };
  }
  settings.boards = boards;

  const overrides = {};
  if (isPlainObject(settings.theme.overrides)) {
    for (const [key, value] of Object.entries(settings.theme.overrides)) {
      if (/^--lb-[a-z0-9-]+$/.test(key) && typeof value === 'string') {
        overrides[key] = value;
      }
    }
  }
  settings.theme.overrides = overrides;

  return settings;
}

export function applySettings(current, partial) {
  return clampSettings(deepMerge(JSON.parse(JSON.stringify(current)), partial));
}

export function mergeSettings(partial) {
  return applySettings(DEFAULT_SETTINGS, partial);
}

export function cssVars(settings) {
  const theme = THEMES[settings.theme.preset] ?? THEMES.midnight;

  return {
    '--lb-bg': theme.background,
    '--lb-text': theme.text,
    '--lb-accent': theme.accent,
    '--lb-rank': theme.accent,
    '--lb-bar': theme.bar,
    '--lb-width': `${settings.layout.width}px`,
    '--lb-padding': `${settings.layout.padding}px`,
    '--lb-radius': `${settings.layout.borderRadius}px`,
    '--lb-opacity': `${settings.visuals.opacity / 100}`,
    '--lb-font-size': `${settings.visuals.fontSize}px`,
    '--lb-font-family': settings.fontFamily.includes(' ')
      ? `"${settings.fontFamily}"`
      : settings.fontFamily,
    '--lb-label-align': settings.labelAlignment,
    ...settings.theme.overrides,
  };
}

const ROTATION_ORDER = ['this_stream', '7d', '30d', 'alltime'];

export function nextRotationWindow(current, order = ROTATION_ORDER) {
  if (order.length === 0) return current;
  const index = order.indexOf(current);
  if (index === -1) return order[0];
  return order[(index + 1) % order.length];
}

export const BOARD_UNITS = {
  points: { singular: 'pt', plural: 'pts', symbol: 'pts' },
  donations: { singular: '$', plural: '$', symbol: '$' },
  bits: { singular: 'bit', plural: 'bits', symbol: 'bit' },
  subs: { singular: 'sub', plural: 'subs', symbol: 'sub' },
  raiders: { singular: 'viewer', plural: 'viewers', symbol: 'raid' },
  chat_messages: { singular: 'mensaje', plural: 'mensajes', symbol: '💬' },
  clips: { singular: 'clip', plural: 'clips', symbol: '🎥' },
};

export const BOARD_LABELS = {
  points: 'Puntos',
  donations: 'Donaciones',
  bits: 'Bits',
  subs: 'Subs',
  raiders: 'Raiders',
  chat_messages: 'Chat',
  clips: 'Clips',
};

export function formatBoardQuantity(boardType, quantity) {
  const unit = BOARD_UNITS[boardType];
  const label = quantity === 1 ? unit.singular : unit.plural;
  return `${quantity} ${label}`;
}
