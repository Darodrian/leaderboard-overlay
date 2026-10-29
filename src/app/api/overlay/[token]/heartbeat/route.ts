import { tokenIsValid } from "@/lib/licensing";
import { loadStreamerByToken } from "@/lib/streamerStore";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type HeartbeatBody = {
  twitchUserId?: string;
  username?: string;
};

/**
 * Heartbeat endpoint for view time tracking.
 * The overlay calls this periodically while a viewer is watching.
 * Creates or extends a view_sessions row for the viewer.
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

  const body = (await request.json().catch(() => null)) as HeartbeatBody | null;
  const twitchUserId = typeof body?.twitchUserId === "string" ? body.twitchUserId.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "Viewer";

  if (!twitchUserId) {
    return Response.json({ error: "twitchUserId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Try to find an active (un-ended) session for this user
  const { data: existing } = await supabase
    .from("view_sessions")
    .select("*")
    .eq("streamer_id", streamer.id)
    .eq("twitch_user_id", twitchUserId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Extend the existing session by adding 30 seconds (heartbeat interval)
    const { error } = await supabase
      .from("view_sessions")
      .update({
        duration_seconds: (existing.duration_seconds ?? 0) + 30,
        username,
      })
      .eq("id", existing.id);

    if (error) {
      return Response.json({ error: "heartbeat failed" }, { status: 500 });
    }
  } else {
    // Create a new session
    const { error } = await supabase
      .from("view_sessions")
      .insert({
        streamer_id: streamer.id,
        twitch_user_id: twitchUserId,
        username,
        started_at: now,
        duration_seconds: 30,
      });

    if (error) {
      return Response.json({ error: "heartbeat failed" }, { status: 500 });
    }
  }

  return new Response(null, { status: 204 });
}
