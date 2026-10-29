import { cookies } from "next/headers";
import { encryptToken, generateOpaqueToken } from "@/lib/licensing";
import { setSession } from "@/lib/sessionCookie";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, fetchTwitchUser, OAUTH_STATE_COOKIE, verifyOAuthState } from "@/lib/twitch";

export const dynamic = "force-dynamic";

function fail(reason: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: `/?error=${encodeURIComponent(reason)}` },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const storedState = store.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !storedState || !verifyOAuthState(storedState, state)) {
    return fail("twitch_login_failed");
  }
  store.delete(OAUTH_STATE_COOKIE);

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !encryptionKey) {
    return fail("twitch_not_configured");
  }

  const redirectUri =
    process.env.TWITCH_REDIRECT_URI ??
    `${url.origin}/api/auth/twitch/callback`;

  try {
    const tokens = await exchangeCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
    const user = await fetchTwitchUser(tokens.accessToken, clientId);
    const encryptedToken = encryptToken(tokens.accessToken, encryptionKey);

    const supabase = createAdminClient();
    const { data: existing, error: lookupError } = await supabase
      .from("streamers")
      .select("id")
      .eq("twitch_user_id", user.id)
      .maybeSingle();

    if (lookupError) return fail("twitch_login_failed");

    let streamerId = existing?.id;

    if (streamerId) {
      const { error } = await supabase
        .from("streamers")
        .update({
          twitch_login: user.login,
          access_token: encryptedToken,
          updated_at: new Date().toISOString(),
        })
        .eq("id", streamerId);

      if (error) return fail("twitch_login_failed");
    } else {
      const { data: created, error } = await supabase
        .from("streamers")
        .insert({
          twitch_user_id: user.id,
          twitch_login: user.login,
          access_token: encryptedToken,
          obs_token: generateOpaqueToken(),
        })
        .select("id")
        .single();

      if (error || !created) return fail("twitch_login_failed");
      streamerId = created.id as string;
    }

    await setSession({ streamerId, twitchUserId: user.id });

    return new Response(null, {
      status: 302,
      headers: { Location: "/dashboard" },
    });
  } catch {
    return fail("twitch_login_failed");
  }
}
