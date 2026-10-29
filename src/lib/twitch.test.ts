import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchTwitchUser,
  verifyOAuthState,
} from "./twitch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildAuthorizeUrl", () => {
  it("builds a twitch authorize url with scopes and state", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "cid",
        redirectUri: "http://localhost/cb",
        state: "xyz",
      }),
    );

    expect(url.host).toBe("id.twitch.tv");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost/cb");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("scope")).toContain("moderator:read:chatters");
  });

  it("uses explicit scopes when given", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "cid",
        redirectUri: "http://localhost/cb",
        state: "xyz",
        scopes: ["user:read:email"],
      }),
    );
    expect(url.searchParams.get("scope")).toBe("user:read:email");
  });
});

describe("verifyOAuthState", () => {
  it("accepts a matching state and rejects a mismatch", () => {
    expect(verifyOAuthState("a", "a")).toBe(true);
    expect(verifyOAuthState("a", "b")).toBe(false);
    expect(verifyOAuthState("", "")).toBe(false);
    expect(verifyOAuthState("a", "")).toBe(false);
  });
});

describe("exchangeCode", () => {
  it("posts the code and maps the token response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeCode({
      code: "code-1",
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: "http://localhost/cb",
    });

    expect(tokens).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      expiresIn: 3600,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://id.twitch.tv/oauth2/token");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("code=code-1");
    expect(String(init.body)).toContain("grant_type=authorization_code");
  });

  it("throws when twitch rejects the code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad", { status: 400 })),
    );

    await expect(
      exchangeCode({
        code: "bad",
        clientId: "cid",
        clientSecret: "secret",
        redirectUri: "http://localhost/cb",
      }),
    ).rejects.toThrow(/token exchange failed/i);
  });
});

describe("fetchTwitchUser", () => {
  it("returns the first helix user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "u1",
              login: "streamer",
              display_name: "Streamer",
              email: "s@example.com",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTwitchUser("at", "cid")).resolves.toEqual({
      id: "u1",
      login: "streamer",
      displayName: "Streamer",
      email: "s@example.com",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.twitch.tv/helix/users");
    expect((init.headers as Record<string, string>)["Client-Id"]).toBe("cid");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer at",
    );
  });

  it("throws when the response has no user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      ),
    );

    await expect(fetchTwitchUser("at", "cid")).rejects.toThrow(/no user/i);
  });
});
