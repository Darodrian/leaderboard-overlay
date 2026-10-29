import { generateOpaqueToken, regenerateOverlayToken } from "@/lib/licensing";
import { getSession } from "@/lib/sessionCookie";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: streamer, error } = await supabase
    .from("streamers")
    .select("obs_token")
    .eq("id", session.streamerId)
    .maybeSingle();

  if (error || !streamer) {
    return Response.json({ error: "streamer not found" }, { status: 404 });
  }

  const next = regenerateOverlayToken(
    { token: streamer.obs_token, isActive: true },
    generateOpaqueToken(),
  );

  const { error: updateError } = await supabase
    .from("streamers")
    .update({
      obs_token: next.token,
      obs_token_regenerated_at: new Date().toISOString(),
    })
    .eq("id", session.streamerId);

  if (updateError) {
    return Response.json({ error: "regeneration failed" }, { status: 500 });
  }

  await supabase
    .from("overlay_sessions")
    .update({ is_active: false })
    .eq("streamer_id", session.streamerId)
    .eq("token", next.previousToken);

  await supabase.from("overlay_sessions").insert({
    streamer_id: session.streamerId,
    token: next.token,
    is_active: true,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return Response.json({
    token: next.token,
    url: new URL(`/overlay/${next.token}`, appUrl).toString(),
  });
}
