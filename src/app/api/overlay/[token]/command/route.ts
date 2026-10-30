import { broadcastToOverlay } from "@/lib/broadcast";
import {
  applyCommand,
  type ChatBadges,
  type ChatCommand,
} from "@/lib/chatCommands";
import { loadStreamerByToken } from "@/lib/streamerStore";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < provided.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const secret = process.env.CHAT_BOT_SECRET;
  if (!secret) {
    return Response.json(
      { error: "chat bot secret not configured" },
      { status: 500 },
    );
  }

  if (!secretMatches(request.headers.get("x-chat-bot-secret"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  const streamer = await loadStreamerByToken(token);
  if (!streamer) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    command?: string;
    userId?: string;
    badges?: ChatBadges;
  } | null;

  const command = body?.command;
  if (command !== "refresh" && command !== "clear-stream") {
    return Response.json({ error: "invalid command" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const result = await applyCommand(
    {
      clearStreamWindow: async (streamerId) => {
        const now = new Date().toISOString();

        await supabase
          .from("stream_windows")
          .update({ is_active: false, ended_at: now })
          .eq("streamer_id", streamerId)
          .eq("window_type", "this_stream")
          .eq("is_active", true);

        const { error } = await supabase.from("stream_windows").insert({
          streamer_id: streamerId,
          window_type: "this_stream",
          started_at: now,
          is_active: true,
        });

        if (error) {
          throw new Error(`stream window reset failed: ${error.message}`);
        }

        // End all active view sessions so new ones get created with the new window's start time.
        await supabase
          .from("view_sessions")
          .update({ ended_at: now })
          .eq("streamer_id", streamerId)
          .is("ended_at", null);

        const { error: flushError } = await supabase.rpc(
          "flush_streamer_aggregates",
          { p_streamer_id: streamerId, p_force: true },
        );

        if (flushError) {
          throw new Error(`aggregate flush failed: ${flushError.message}`);
        }
      },
      broadcast: async (_streamerId, event, payload) => {
        await broadcastToOverlay(streamer.obsToken, event, payload);
      },
    },
    {
      streamerId: streamer.id,
      command: command as ChatCommand,
      badges: body?.badges ?? {},
      userId: body?.userId ?? "",
      broadcasterId: streamer.twitchUserId,
    },
  );

  if (result === "rejected") {
    return Response.json({ error: "moderator only" }, { status: 403 });
  }

  return Response.json({ result });
}
