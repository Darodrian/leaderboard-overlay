import { createEventDeps } from "@/lib/eventDeps";
import { handleEvent } from "@/lib/events";
import { tokenIsValid } from "@/lib/licensing";
import { loadStreamerByToken } from "@/lib/streamerStore";

export const dynamic = "force-dynamic";

type TipBody = {
  eventId?: string;
  userId?: string;
  username?: string;
  amountCents?: number;
  isAnonymous?: boolean;
};

/**
 * Tip ingestion for a donation provider bridge. The OBS token is the secret:
 * keep the overlay URL private. `eventId` should be stable per donation from
 * the provider so retries are deduplicated.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const streamer = await loadStreamerByToken(token);

  if (
    !streamer ||
    !tokenIsValid({ token: streamer.obsToken, isActive: true }, token)
  ) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as TipBody | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const username =
    typeof body?.username === "string" ? body.username.trim() : "";
  const amountCents = Number(body?.amountCents);

  if (
    !eventId ||
    !userId ||
    !username ||
    !Number.isFinite(amountCents) ||
    amountCents < 0
  ) {
    return Response.json(
      { error: "eventId, userId, username, and a non-negative amountCents are required" },
      { status: 400 },
    );
  }

  const result = await handleEvent(createEventDeps(), {
    subscriptionType: "tip",
    event: {
      user_id: userId,
      user_login: userId,
      user_name: username,
      amount_cents: Math.floor(amountCents),
      is_anonymous: body?.isAnonymous === true,
    },
    messageId: eventId,
    broadcasterUserId: streamer.twitchUserId,
  });

  return Response.json({ result });
}
