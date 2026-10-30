import { broadcastToOverlay } from "@/lib/broadcast";
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
 * The bot POSTs each message here; we store it for chat_messages board
 * aggregation and use it for chat-based view time tracking.
 *
 * Each chat message from a non-bot user adds 30 seconds to their view time.
 * Exclusion settings can skip broadcaster and/or mods for view time and/or
 * chat message counting.
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

  const settings = streamer as unknown as {
    excludeBroadcasterFromViewTime?: boolean;
    excludeModsFromViewTime?: boolean;
    excludeBroadcasterFromChatMessages?: boolean;
    excludeModsFromChatMessages?: boolean;
  };

  const shouldCountChat =
    !(settings.excludeBroadcasterFromChatMessages && isBroadcaster) &&
    !(settings.excludeModsFromChatMessages && isMod);

  const shouldCountViewTime =
    !isBot &&
    !(settings.excludeBroadcasterFromViewTime && isBroadcaster) &&
    !(settings.excludeModsFromViewTime && isMod);

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Insert chat event if not excluded
  if (shouldCountChat) {
    const { error: eventError } = await supabase.from("chat_events").insert({
      streamer_id: streamer.id,
      twitch_user_id: userId,
      username,
      is_bot: isBot,
      is_broadcaster: isBroadcaster,
      is_mod: isMod,
    });

    if (eventError) {
      return Response.json({ error: "chat event failed" }, { status: 500 });
    }
  }

  // Update view time: add 30 seconds per message to the user's active session
  if (shouldCountViewTime) {
    // Find an existing active (un-ended) session for this user
    const { data: existing } = await supabase
      .from("view_sessions")
      .select("*")
      .eq("streamer_id", streamer.id)
      .eq("twitch_user_id", userId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from("view_sessions")
        .update({
          duration_seconds: (existing.duration_seconds ?? 0) + 30,
          username,
        })
        .eq("id", existing.id);

      if (updateError) {
        return Response.json({ error: "view time update failed" }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabase.from("view_sessions").insert({
        streamer_id: streamer.id,
        twitch_user_id: userId,
        username,
        started_at: now,
        duration_seconds: 30,
      });

      if (insertError) {
        return Response.json({ error: "view time insert failed" }, { status: 500 });
      }
    }
  }

  // Flush aggregates so new chat/view-time data appears in leaderboards
  const { error: flushError } = await supabase.rpc("flush_streamer_aggregates", {
    p_streamer_id: streamer.id,
    p_force: true,
    p_board_type: null,
  });

  if (flushError) {
    return Response.json({ error: "aggregate flush failed" }, { status: 500 });
  }

  // Broadcast so overlays refetch and show updated data
  try {
    await broadcastToOverlay(streamer.obsToken, "leaderboard.update", {
      type: "leaderboard.update",
      streamerId: streamer.id,
      window: "this_stream",
    });
  } catch {
    // Broadcast failure shouldn't fail the request; aggregates are already flushed
  }

  return new Response(null, { status: 204 });
}
