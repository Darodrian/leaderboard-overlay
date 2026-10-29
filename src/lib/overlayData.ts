import "server-only";
import { tokenIsValid } from "./licensing";
import { mapStreamerRow, toOverlaySettings, type StreamerRow } from "./streamers";
import { createAdminClient } from "./supabase/admin";
import type {
  LeaderboardRow,
  OverlayState,
  OverlayWindowMap,
  WindowType,
} from "./types";

export const WINDOW_TYPES: WindowType[] = [
  "this_stream",
  "7d",
  "30d",
  "alltime",
];

export async function loadOverlayState(
  token: string,
): Promise<OverlayState | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("streamers")
    .select("*")
    .eq("obs_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const streamer = mapStreamerRow(data as StreamerRow);
  if (!tokenIsValid({ token: streamer.obsToken, isActive: true }, token)) {
    return null;
  }

  const { data: aggregateRows } = await supabase
    .from("leaderboard_aggregates")
    .select("window_type,user_id,username,points,last_event_at")
    .eq("streamer_id", streamer.id);

  const windows = Object.fromEntries(
    WINDOW_TYPES.map((window) => [window, [] as LeaderboardRow[]]),
  ) as OverlayWindowMap;

  for (const row of aggregateRows ?? []) {
    const window = row.window_type as WindowType;
    if (!windows[window]) continue;
    windows[window].push({
      userId: row.user_id,
      username: row.username,
      points: row.points,
      lastEventAt: row.last_event_at,
    });
  }

  for (const window of WINDOW_TYPES) {
    windows[window].sort((a, b) => b.points - a.points);
  }

  return {
    rows: windows.this_stream,
    settings: toOverlaySettings(streamer),
    window: "this_stream",
    windows,
  };
}
