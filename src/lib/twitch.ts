export const DEFAULT_SCOPES = ["user:read:email", "moderator:read:chatters"];
export const OAUTH_STATE_COOKIE = "twitch_oauth_state";

const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";

export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
};

export type ExchangeParams = {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type TwitchTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

export type TwitchUser = {
  id: string;
  login: string;
  displayName: string;
  email?: string;
};

export function buildAuthorizeUrl({
  clientId,
  redirectUri,
  state,
  scopes = DEFAULT_SCOPES,
}: AuthorizeParams): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export function verifyOAuthState(stored: string, returned: string): boolean {
  if (!stored || !returned || stored.length !== returned.length) return false;

  let diff = 0;
  for (let index = 0; index < stored.length; index += 1) {
    diff |= stored.charCodeAt(index) ^ returned.charCodeAt(index);
  }
  return diff === 0;
}

export async function exchangeCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
}: ExchangeParams): Promise<TwitchTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Twitch token exchange failed with status ${response.status}`);
  }

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    throw new Error("Twitch token exchange returned no access token");
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

export async function fetchTwitchUser(
  accessToken: string,
  clientId: string,
): Promise<TwitchUser> {
  const response = await fetch(USERS_URL, {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Twitch user lookup failed with status ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: {
      id?: string;
      login?: string;
      display_name?: string;
      email?: string;
    }[];
  };

  const user = json.data?.[0];
  if (!user?.id || !user.login) {
    throw new Error("Twitch user lookup returned no user");
  }

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name ?? user.login,
    email: user.email,
  };
}
