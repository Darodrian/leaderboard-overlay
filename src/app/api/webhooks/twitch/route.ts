import { createEventDeps } from "@/lib/eventDeps";
import { handleEvent } from "@/lib/events";
import { verifyTwitchSignature } from "@/lib/eventsub";

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

  const result = await handleEvent(createEventDeps(), {
    subscriptionType,
    event,
    messageId,
    broadcasterUserId,
  });

  return Response.json({ result });
}
