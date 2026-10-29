export type WindowType = "this_stream" | "7d" | "30d" | "alltime";

export type EventType = "tip" | "bit" | "sub" | "gift" | "raid";

export type ThemePreset = "midnight" | "ember" | "mint" | "grape" | "paper";

export type PointConfig = {
  tip: number;
  bit: number;
  sub: number;
  gift: number;
  raid: number;
};

export type DisplayToggles = {
  ranks: boolean;
  medals: boolean;
  rankNumbers: boolean;
  bars: boolean;
  amounts: boolean;
};

export type LayoutSettings = {
  width: number;
  padding: number;
  borderRadius: number;
};

export type VisualSettings = {
  opacity: number;
  fontSize: number;
};

export type ThemeSettings = {
  preset: ThemePreset;
  overrides: Record<string, string>;
};

export type RotationSettings = {
  enabled: boolean;
  intervalMs: number;
};

export type Streamer = {
  id: string;
  twitchUserId: string;
  twitchLogin: string;
  licenseKey: string | null;
  obsToken: string;
  anonymousMaskName: string | null;
  tipThresholdCents: number;
  pointConfig: PointConfig;
  display: DisplayToggles;
  hiddenAccounts: string[];
  layout: LayoutSettings;
  visuals: VisualSettings;
  theme: ThemeSettings;
  rotation: RotationSettings;
  createdAt: string;
};

export type OverlaySettings = Pick<
  Streamer,
  | "pointConfig"
  | "tipThresholdCents"
  | "anonymousMaskName"
  | "display"
  | "hiddenAccounts"
  | "layout"
  | "visuals"
  | "theme"
  | "rotation"
>;

export type License = {
  key: string;
  twitchUserId: string | null;
  isActive: boolean;
  expiresAt: string | null;
  etsyOrderId: string | null;
  boundAt: string | null;
  createdAt: string;
};

export type OverlaySession = {
  id: string;
  streamerId: string;
  token: string;
  isActive: boolean;
  lastSeen: string;
  createdAt: string;
};

export type PointEvent = {
  id: string;
  streamerId: string;
  twitchEventId: string;
  eventType: EventType;
  creditedUserId: string;
  creditedUsername: string;
  amountCents: number;
  pointsAwarded: number;
  isAnonymous: boolean;
  createdAt: string;
};

export type PointEventInput = Omit<PointEvent, "id" | "createdAt"> & {
  rawPayload?: Record<string, unknown>;
};

export type LeaderboardRow = {
  userId: string;
  username: string;
  points: number;
  rank?: number;
  lastEventAt?: string;
};

export type OverlayWindowMap = Record<WindowType, LeaderboardRow[]>;

export type OverlayState = {
  rows: LeaderboardRow[];
  settings: OverlaySettings;
  window: WindowType;
  windows?: OverlayWindowMap;
  /** A flush was skipped by the 2s throttle; the overlay should refetch soon. */
  pending?: boolean;
};
