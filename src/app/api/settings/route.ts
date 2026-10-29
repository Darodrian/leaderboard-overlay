import { broadcastToOverlay } from "@/lib/broadcast";
import { getSession } from "@/lib/sessionCookie";
import { applySettings, type DeepPartial } from "@/lib/settings";
import { loadStreamerById } from "@/lib/streamerStore";
import { settingsToRow, toOverlaySettings } from "@/lib/streamers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OverlaySettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const streamer = await loadStreamerById(session.streamerId);
  if (!streamer) {
    return Response.json({ error: "streamer not found" }, { status: 404 });
  }

  return Response.json({
    settings: toOverlaySettings(streamer),
    twitchLogin: streamer.twitchLogin,
    obsToken: streamer.obsToken,
    licenseKey: streamer.licenseKey,
  });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const candidate = "settings" in body ? body.settings : body;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return Response.json({ error: "invalid settings" }, { status: 400 });
  }

  const partial = candidate as DeepPartial<OverlaySettings>;
  if (partial.hiddenAccounts !== undefined) {
    if (
      !Array.isArray(partial.hiddenAccounts) ||
      partial.hiddenAccounts.some((account) => typeof account !== "string")
    ) {
      return Response.json(
        { error: "hiddenAccounts must be a list of names" },
        { status: 400 },
      );
    }
  }

  const streamer = await loadStreamerById(session.streamerId);
  if (!streamer) {
    return Response.json({ error: "streamer not found" }, { status: 404 });
  }

  let next: OverlaySettings;
  try {
    next = applySettings(toOverlaySettings(streamer), partial);
  } catch {
    return Response.json({ error: "invalid settings" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("streamers")
    .update({ ...settingsToRow(next), updated_at: new Date().toISOString() })
    .eq("id", streamer.id);

  if (error) {
    return Response.json({ error: "save failed" }, { status: 500 });
  }

  try {
    await broadcastToOverlay(streamer.obsToken, "settings.update", {
      type: "settings.update",
      settings: next,
    });
  } catch {
    // The save is committed; the overlay will catch up on its next refresh.
  }

  return Response.json({ settings: next });
}
