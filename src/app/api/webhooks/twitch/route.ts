import { createEventDeps } from "@/lib/eventDeps";
import { handleEvent } from "@/lib/events";
import { parseClipEvent, verifyTwitchSignature } from "@/lib/eventsub";
import {
  loadStreamerByToken,
  loadStreamerByTwitchUserId,
} from "@/lib/streamerStore";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const secret = process.env.TWITCH_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("webhook secret not configured", { status: 500 });
  }

  // Verify every message type, including the verification challenge, so only
  // Twitch can make this endpoint echo a challenge or revoke a subscription.
  if (!(await verifyTwitchSignature(request.headers, rawBody, secret))) {
    return new Response("invalid signature", { status: 403 });
  }

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

  // Handle clip events separately (they go to clip_events, not point_events)
  if (subscriptionType === "channel.clip.created") {
    const clip = parseClipEvent(event);
    if (!clip) {
      return new Response("bad clip payload", { status: 400 });
    }

    const streamer = await loadStreamerByTwitchUserId(broadcasterUserId);
    if (!streamer) {
      return Response.json({ error: "streamer not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("clip_events").insert({
      streamer_id: streamer.id,
      twitch_user_id: clip.userId,
      username: clip.username,
      clip_id: clip.clipId,
    });

    if (error) {
      return Response.json({ error: "clip event failed" }, { status: 500 });
    }

    return Response.json({ result: "processed" });
  }

  const result = await handleEvent(createEventDeps(), {
    subscriptionType,
    event,
    messageId,
    broadcasterUserId,
  });

  return Response.json({ result });
}
