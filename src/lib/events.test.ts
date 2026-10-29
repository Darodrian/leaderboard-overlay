import { describe, it, expect, vi } from "vitest";
import { handleEvent } from "./events";
import type { Streamer } from "./types";

const streamer: Streamer = {
  id: "s1",
  twitchUserId: "owner",
  twitchLogin: "owner_login",
  licenseKey: "LIC-1",
  obsToken: "tok",
  anonymousMaskName: "Mystery Supporter",
  tipThresholdCents: 100,
  pointConfig: { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 },
  display: {
    ranks: true,
    medals: true,
    rankNumbers: true,
    bars: true,
    amounts: true,
  },
  hiddenAccounts: [],
  layout: { width: 420, padding: 12, borderRadius: 16 },
  visuals: { opacity: 100, fontSize: 18 },
  theme: { preset: "midnight", overrides: {} },
  rotation: { enabled: false, intervalMs: 30000 },
  boards: {
    points: { active: true, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 25 },
    donations: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
    bits: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
    subs: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
    raiders: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
    view_time: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
    chat_messages: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
    clips: { active: false, windows: ["this_stream", "7d", "30d", "alltime"], rankCount: 10 },
  },
  pointsSuffix: "pts",
  screenLayout: "single",
  rotationMode: "both",
  fontFamily: "system",
  labelAlignment: "center",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function deps(overrides: Record<string, unknown> = {}) {
  return {
    findStreamer: vi.fn().mockResolvedValue(streamer),
    insertPointEvent: vi.fn().mockResolvedValue("inserted"),
    flushAggregates: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn().mockResolvedValue(undefined),
    now: () => 0,
    ...overrides,
  };
}

describe("handleEvent", () => {
  it("credits the gifter for a gift bundle", async () => {
    const d = deps();
    const out = await handleEvent(d, {
      subscriptionType: "channel.subscription.gift",
      event: {
        user_id: "gifter",
        user_login: "g",
        user_name: "G",
        total: 5,
        is_anonymous: false,
      },
      messageId: "m1",
      broadcasterUserId: "owner",
    });
    expect(out).toBe("processed");
    expect(d.insertPointEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "gift",
        creditedUserId: "gifter",
        pointsAwarded: 1500,
      }),
    );
  });

  it("ignores recipient subscription messages for gifts", async () => {
    const d = deps();
    const out = await handleEvent(d, {
      subscriptionType: "channel.subscription.message",
      event: { user_id: "recipient", is_gift: true },
      messageId: "m2",
      broadcasterUserId: "owner",
    });
    expect(out).toBe("ignored");
    expect(d.insertPointEvent).not.toHaveBeenCalled();
  });

  it("drops duplicate deliveries", async () => {
    const d = deps({
      insertPointEvent: vi.fn().mockResolvedValue("duplicate"),
    });
    const out = await handleEvent(d, {
      subscriptionType: "channel.cheer",
      event: { user_id: "u", bits: 10 },
      messageId: "m3",
      broadcasterUserId: "owner",
    });
    expect(out).toBe("duplicate");
    expect(d.broadcast).not.toHaveBeenCalled();
  });

  it("re-flushes on a duplicate delivery so a missed flush self-heals", async () => {
    const d = deps({
      insertPointEvent: vi.fn().mockResolvedValue("duplicate"),
    });
    await handleEvent(d, {
      subscriptionType: "channel.cheer",
      event: { user_id: "u", bits: 10 },
      messageId: "m3",
      broadcasterUserId: "owner",
    });
    expect(d.flushAggregates).toHaveBeenCalledWith("s1");
  });

  it("ignores an event that awards zero points", async () => {
    const d = deps();
    const out = await handleEvent(d, {
      subscriptionType: "channel.subscription.gift",
      event: { user_id: "gifter", user_name: "G" },
      messageId: "m7",
      broadcasterUserId: "owner",
    });
    expect(out).toBe("ignored");
    expect(d.insertPointEvent).not.toHaveBeenCalled();
  });

  it("still masks anonymous gifters when the mask is cleared", async () => {
    const d = deps({
      findStreamer: vi
        .fn()
        .mockResolvedValue({ ...streamer, anonymousMaskName: "  " }),
    });
    await handleEvent(d, {
      subscriptionType: "channel.cheer",
      event: {
        user_id: "u",
        user_login: "real",
        user_name: "Real",
        bits: 10,
        is_anonymous: true,
      },
      messageId: "m8",
      broadcasterUserId: "owner",
    });
    const row = (d.insertPointEvent as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(row.creditedUsername).not.toBe("Real");
    expect(row.creditedUsername).toBe("Anonymous");
  });

  it("applies the anonymous mask to the credited username", async () => {
    const d = deps();
    await handleEvent(d, {
      subscriptionType: "channel.cheer",
      event: {
        user_id: "u",
        user_login: "real",
        user_name: "Real",
        bits: 10,
        is_anonymous: true,
      },
      messageId: "m4",
      broadcasterUserId: "owner",
    });
    expect(d.insertPointEvent).toHaveBeenCalledWith(
      expect.objectContaining({ creditedUsername: "Mystery Supporter" }),
    );
  });

  it("ignores tiny tips below the threshold", async () => {
    const d = deps();
    const out = await handleEvent(d, {
      subscriptionType: "tip",
      event: { user_id: "u", user_login: "u", user_name: "U", amount_cents: 50 },
      messageId: "m5",
      broadcasterUserId: "owner",
    });
    expect(out).toBe("ignored");
  });

  it("returns unknown-streamer when the broadcaster is unregistered", async () => {
    const d = deps({ findStreamer: vi.fn().mockResolvedValue(null) });
    const out = await handleEvent(d, {
      subscriptionType: "channel.cheer",
      event: { user_id: "u", bits: 10 },
      messageId: "m6",
      broadcasterUserId: "nobody",
    });
    expect(out).toBe("unknown-streamer");
  });
});
