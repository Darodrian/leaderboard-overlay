import { canBindLicense } from "@/lib/licensing";
import { getSession } from "@/lib/sessionCookie";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    licenseKey?: string;
  } | null;
  const licenseKey = body?.licenseKey?.trim();

  if (!licenseKey) {
    return Response.json({ error: "license key required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: license, error } = await supabase
    .from("licenses")
    .select("*")
    .eq("key", licenseKey)
    .maybeSingle();

  if (error || !license) {
    return Response.json({ error: "invalid license" }, { status: 404 });
  }
  if (!license.is_active) {
    return Response.json({ error: "license inactive" }, { status: 403 });
  }
  if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) {
    return Response.json({ error: "license expired" }, { status: 403 });
  }
  if (
    !canBindLicense(
      { twitchUserId: license.twitch_user_id },
      session.twitchUserId,
    )
  ) {
    return Response.json(
      { error: "license already bound to another account" },
      { status: 409 },
    );
  }

  if (!license.twitch_user_id) {
    const { error: bindError } = await supabase
      .from("licenses")
      .update({
        twitch_user_id: session.twitchUserId,
        bound_at: new Date().toISOString(),
      })
      .eq("key", licenseKey)
      .is("twitch_user_id", null);

    if (bindError) {
      return Response.json({ error: "binding failed" }, { status: 500 });
    }
  }

  await supabase
    .from("streamers")
    .update({ license_key: licenseKey })
    .eq("id", session.streamerId);

  return Response.json({ ok: true, boundTwitchUserId: session.twitchUserId });
}
