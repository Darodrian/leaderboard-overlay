import type { OverlaySettings, Streamer } from "./types";

export type StreamerRow = {
  id: string;
  twitch_user_id: string;
  twitch_login: string;
  license_key: string | null;
  obs_token: string;
  anonymous_mask_name: string | null;
  tip_threshold_cents: number;
  point_config: Streamer["pointConfig"];
  display_toggles: Streamer["display"];
  hidden_accounts: string[] | null;
  layout: Streamer["layout"];
  visuals: Streamer["visuals"];
  theme: Streamer["theme"];
  rotation: Streamer["rotation"];
  created_at: string;
};

export function mapStreamerRow(row: StreamerRow): Streamer {
  return {
    id: row.id,
    twitchUserId: row.twitch_user_id,
    twitchLogin: row.twitch_login,
    licenseKey: row.license_key,
    obsToken: row.obs_token,
    anonymousMaskName: row.anonymous_mask_name,
    tipThresholdCents: row.tip_threshold_cents,
    pointConfig: row.point_config,
    display: row.display_toggles,
    hiddenAccounts: row.hidden_accounts ?? [],
    layout: row.layout,
    visuals: row.visuals,
    theme: row.theme,
    rotation: row.rotation,
    createdAt: row.created_at,
  };
}

export function toOverlaySettings(streamer: Streamer): OverlaySettings {
  return {
    pointConfig: streamer.pointConfig,
    tipThresholdCents: streamer.tipThresholdCents,
    anonymousMaskName: streamer.anonymousMaskName,
    display: streamer.display,
    hiddenAccounts: streamer.hiddenAccounts,
    layout: streamer.layout,
    visuals: streamer.visuals,
    theme: streamer.theme,
    rotation: streamer.rotation,
  };
}

export type StreamerSettingsRow = Pick<
  StreamerRow,
  | "point_config"
  | "tip_threshold_cents"
  | "anonymous_mask_name"
  | "display_toggles"
  | "hidden_accounts"
  | "layout"
  | "visuals"
  | "theme"
  | "rotation"
>;

export function settingsToRow(
  settings: OverlaySettings,
): StreamerSettingsRow {
  return {
    point_config: settings.pointConfig,
    tip_threshold_cents: settings.tipThresholdCents,
    anonymous_mask_name: settings.anonymousMaskName,
    display_toggles: settings.display,
    hidden_accounts: settings.hiddenAccounts,
    layout: settings.layout,
    visuals: settings.visuals,
    theme: settings.theme,
    rotation: settings.rotation,
  };
}
