import { generateOpaqueToken } from "@/lib/licensing";
import { buildAuthorizeUrl, OAUTH_STATE_COOKIE } from "@/lib/twitch";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    return new Response("Twitch OAuth is not configured", { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const redirectUri =
    process.env.TWITCH_REDIRECT_URI ?? `${origin}/api/auth/twitch/callback`;
  const state = generateOpaqueToken(16);

  const cookie = [
    `${OAUTH_STATE_COOKIE}=${state}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=600",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  return new Response(null, {
    status: 302,
    headers: {
      Location: buildAuthorizeUrl({ clientId, redirectUri, state }),
      "Set-Cookie": cookie,
    },
  });
}
