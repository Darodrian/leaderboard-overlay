import "server-only";
import { broadcastToOverlay } from "./broadcast";
import type { EventDeps } from "./events";
import { mapStreamerRow, type StreamerRow } from "./streamers";
import { createAdminClient } from "./supabase/admin";
import type { PointEventInput } from "./types";

export function createEventDeps(): EventDeps {
  const supabase = createAdminClient();

  return {
    findStreamer: async (twitchUserId) => {
      const { data, error } = await supabase
        .from("streamers")
        .select("*")
        .eq("twitch_user_id", twitchUserId)
        .maybeSingle();

      if (error || !data) return null;
      return mapStreamerRow(data as StreamerRow);
    },
    insertPointEvent: async (row: PointEventInput) => {
      const { error } = await supabase.from("point_events").insert({
        streamer_id: row.streamerId,
        twitch_event_id: row.twitchEventId,
        event_type: row.eventType,
        credited_user_id: row.creditedUserId,
        credited_username: row.creditedUsername,
        amount_cents: row.amountCents,
        points_awarded: row.pointsAwarded,
        is_anonymous: row.isAnonymous,
        raw_payload: row.rawPayload ?? {},
      });

      if (!error) return "inserted";
      if (error.code === "23505") return "duplicate";
      throw new Error(`point_events insert failed: ${error.message}`);
    },
    flushAggregates: async (streamerId) => {
      const { error } = await supabase.rpc("flush_streamer_aggregates", {
        p_streamer_id: streamerId,
      });
      if (error) throw new Error(`aggregate flush failed: ${error.message}`);
    },
    broadcast: async (streamer, payload) => {
      await broadcastToOverlay(
        streamer.obsToken,
        "leaderboard.update",
        payload as Record<string, unknown>,
      );
    },
  };
}
