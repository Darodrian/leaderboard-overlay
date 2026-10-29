import type { OverlaySettings, ScreenLayout, RotationMode, LabelAlignment, Streamer } from "./types";

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
  boards: Streamer["boards"];
  points_suffix: string;
  screen_layout: string;
  rotation_mode: string;
  font_family: string;
  label_alignment: string;
  exclude_broadcaster_from_view_time: boolean;
  exclude_mods_from_view_time: boolean;
  exclude_broadcaster_from_chat_messages: boolean;
  exclude_mods_from_chat_messages: boolean;
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
    boards: row.boards,
    pointsSuffix: row.points_suffix,
    screenLayout: row.screen_layout as ScreenLayout,
    rotationMode: row.rotation_mode as RotationMode,
    fontFamily: row.font_family,
    labelAlignment: row.label_alignment as LabelAlignment,
    excludeBroadcasterFromViewTime: row.exclude_broadcaster_from_view_time,
    excludeModsFromViewTime: row.exclude_mods_from_view_time,
    excludeBroadcasterFromChatMessages: row.exclude_broadcaster_from_chat_messages,
    excludeModsFromChatMessages: row.exclude_mods_from_chat_messages,
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
    boards: streamer.boards,
    pointsSuffix: streamer.pointsSuffix,
    screenLayout: streamer.screenLayout,
    rotationMode: streamer.rotationMode,
    fontFamily: streamer.fontFamily,
    labelAlignment: streamer.labelAlignment,
    excludeBroadcasterFromViewTime: streamer.excludeBroadcasterFromViewTime,
    excludeModsFromViewTime: streamer.excludeModsFromViewTime,
    excludeBroadcasterFromChatMessages: streamer.excludeBroadcasterFromChatMessages,
    excludeModsFromChatMessages: streamer.excludeModsFromChatMessages,
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
  | "boards"
  | "points_suffix"
  | "screen_layout"
  | "rotation_mode"
  | "font_family"
  | "label_alignment"
  | "exclude_broadcaster_from_view_time"
  | "exclude_mods_from_view_time"
  | "exclude_broadcaster_from_chat_messages"
  | "exclude_mods_from_chat_messages"
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
    boards: settings.boards,
    points_suffix: settings.pointsSuffix,
    screen_layout: settings.screenLayout,
    rotation_mode: settings.rotationMode,
    font_family: settings.fontFamily,
    label_alignment: settings.labelAlignment,
    exclude_broadcaster_from_view_time: settings.excludeBroadcasterFromViewTime,
    exclude_mods_from_view_time: settings.excludeModsFromViewTime,
    exclude_broadcaster_from_chat_messages: settings.excludeBroadcasterFromChatMessages,
    exclude_mods_from_chat_messages: settings.excludeModsFromChatMessages,
  };
}
