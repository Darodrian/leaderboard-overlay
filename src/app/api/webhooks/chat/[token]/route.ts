import { loadStreamerByToken } from "@/lib/streamerStore";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ChatEventBody = {
  userId?: string;
  username?: string;
  isBot?: boolean;
  isBroadcaster?: boolean;
  isMod?: boolean;
};

/**
 * Chat message ingestion for the chat bot.
 * The bot POSTs each message here; we store it for chat_messages board aggregation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const streamer = await loadStreamerByToken(token);

  if (!streamer) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as ChatEventBody | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const isBot = body?.isBot === true;
  const isBroadcaster = body?.isBroadcaster === true;
  const isMod = body?.isMod === true;

  if (!userId || !username) {
    return Response.json({ error: "userId and username are required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("chat_events").insert({
    streamer_id: streamer.id,
    twitch_user_id: userId,
    username,
    is_bot: isBot,
    is_broadcaster: isBroadcaster,
    is_mod: isMod,
  });

  if (error) {
    return Response.json({ error: "chat event failed" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
