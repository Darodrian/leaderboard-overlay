import { broadcastToOverlay } from "@/lib/broadcast";
import { handleEvent } from "@/lib/events";
import { verifyTwitchSignature } from "@/lib/eventsub";
import { mapStreamerRow, type StreamerRow } from "@/lib/streamers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PointEventInput } from "@/lib/types";

export const runtime = "edge";

type EventSubBody = {
  challenge?: string;
  subscription?: {
    type?: string;
    condition?: { broadcaster_user_id?: string };
  };
  event?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const messageType = request.headers.get("Twitch-Eventsub-Message-Type");

  if (messageType === "webhook_callback_verification") {
    let body: EventSubBody;
    try {
      body = JSON.parse(rawBody) as EventSubBody;
    } catch {
      return new Response("bad request", { status: 400 });
    }
    return new Response(body.challenge ?? "", { status: 200 });
  }

  if (messageType === "revocation") {
    return new Response(null, { status: 204 });
  }

  const secret = process.env.TWITCH_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("webhook secret not configured", { status: 500 });
  }

  if (!(await verifyTwitchSignature(request.headers, rawBody, secret))) {
    return new Response("invalid signature", { status: 403 });
  }

  let body: EventSubBody;
  try {
    body = JSON.parse(rawBody) as EventSubBody;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const subscriptionType = body.subscription?.type;
  const broadcasterUserId = body.subscription?.condition?.broadcaster_user_id;
  const event = body.event;
  const messageId = request.headers.get("Twitch-Eventsub-Message-Id");

  if (!subscriptionType || !broadcasterUserId || !event || !messageId) {
    return new Response("bad payload", { status: 400 });
  }

  const supabase = createAdminClient();

  const result = await handleEvent(
    {
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
    },
    { subscriptionType, event, messageId, broadcasterUserId },
  );

  return Response.json({ result });
}
