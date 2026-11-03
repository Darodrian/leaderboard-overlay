export function mapStreamerRow(row) {
  return {
    id: row.id,
    twitchUserId: row.twitch_user_id,
    twitchLogin: row.twitch_login,
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
    screenLayout: row.screen_layout,
    rotationMode: row.rotation_mode,
    fontFamily: row.font_family,
    labelAlignment: row.label_alignment,
    boardLabels: row.board_labels ? JSON.parse(row.board_labels) : {},
    excludeBroadcasterFromChatMessages: row.exclude_broadcaster_from_chat_messages,
    excludeModsFromChatMessages: row.exclude_mods_from_chat_messages,
    createdAt: row.created_at,
  };
}

export function toOverlaySettings(streamer) {
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
    screenLayout: streamer.screenLayout,
    rotationMode: streamer.rotationMode,
    fontFamily: streamer.fontFamily,
    labelAlignment: streamer.labelAlignment,
    boardLabels: streamer.boardLabels,
    excludeBroadcasterFromChatMessages: streamer.excludeBroadcasterFromChatMessages,
    excludeModsFromChatMessages: streamer.excludeModsFromChatMessages,
  };
}

export function settingsToRow(settings) {
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
    screen_layout: settings.screenLayout,
    rotation_mode: settings.rotationMode,
    font_family: settings.fontFamily,
    label_alignment: settings.labelAlignment,
    board_labels: JSON.stringify(settings.boardLabels),
    exclude_broadcaster_from_chat_messages: settings.excludeBroadcasterFromChatMessages,
    exclude_mods_from_chat_messages: settings.excludeModsFromChatMessages,
  };
}
