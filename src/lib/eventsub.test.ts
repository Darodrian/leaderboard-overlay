import { describe, it, expect } from "vitest";
import { computeHmac, verifyTwitchSignature, parseEvent } from "./eventsub";

const secret = "s3cret";

describe("verifyTwitchSignature", () => {
  it("accepts a valid signature", async () => {
    const body = '{"a":1}';
    const id = "msg-1";
    const ts = new Date().toISOString();
    const sig = await computeHmac(id + ts + body, secret);
    const headers = new Headers({
      "Twitch-Eventsub-Message-Id": id,
      "Twitch-Eventsub-Message-Timestamp": ts,
      "Twitch-Eventsub-Signature": "sha256=" + sig,
    });
    expect(await verifyTwitchSignature(headers, body, secret)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const body = '{"a":1}';
    const ts = new Date().toISOString();
    const sig = await computeHmac("msg-1" + ts + body, secret);
    const headers = new Headers({
      "Twitch-Eventsub-Message-Id": "msg-1",
      "Twitch-Eventsub-Message-Timestamp": ts,
      "Twitch-Eventsub-Signature": "sha256=" + sig,
    });
    expect(await verifyTwitchSignature(headers, '{"a":2}', secret)).toBe(false);
  });

  it("rejects a stale timestamp", async () => {
    const body = "{}";
    const ts = new Date(Date.now() - 600_000).toISOString();
    const sig = await computeHmac("m" + ts + body, secret);
    const headers = new Headers({
      "Twitch-Eventsub-Message-Id": "m",
      "Twitch-Eventsub-Message-Timestamp": ts,
      "Twitch-Eventsub-Signature": "sha256=" + sig,
    });
    expect(await verifyTwitchSignature(headers, body, secret)).toBe(false);
  });
});

describe("parseEvent gifted subs", () => {
  it("credits the gifter, never the recipient", () => {
    const p = parseEvent("channel.subscription.gift", {
      user_id: "gifter-1",
      user_login: "gifter",
      user_name: "Gifter",
      total: 5,
      is_anonymous: false,
    });
    expect(p).toMatchObject({
      kind: "credit",
      eventType: "gift",
      userId: "gifter-1",
      amount: 5,
    });
  });

  it("ignores the recipient subscription.message of a gift", () => {
    const p = parseEvent("channel.subscription.message", {
      user_id: "recipient-1",
      is_gift: true,
      tier: "1000",
    });
    expect(p.kind).toBe("ignore");
  });

  it("credits a normal resub", () => {
    const p = parseEvent("channel.subscription.message", {
      user_id: "sub-1",
      user_login: "s",
      user_name: "S",
      is_gift: false,
    });
    expect(p).toMatchObject({
      kind: "credit",
      eventType: "sub",
      userId: "sub-1",
      amount: 1,
    });
  });

  it("credits a normal channel.subscribe", () => {
    const p = parseEvent("channel.subscribe", {
      user_id: "sub-2",
      user_login: "s2",
      user_name: "S2",
      is_gift: false,
    });
    expect(p).toMatchObject({
      kind: "credit",
      eventType: "sub",
      userId: "sub-2",
      amount: 1,
    });
  });

  it("ignores a gifted channel.subscribe", () => {
    const p = parseEvent("channel.subscribe", {
      user_id: "recipient-2",
      is_gift: true,
    });
    expect(p.kind).toBe("ignore");
  });

  it("credits cheer bits", () => {
    const p = parseEvent("channel.cheer", {
      user_id: "u1",
      user_login: "u",
      user_name: "U",
      bits: 500,
      is_anonymous: false,
    });
    expect(p).toMatchObject({
      kind: "credit",
      eventType: "bit",
      amount: 500,
    });
  });

  it("credits the raider from broadcaster fields", () => {
    const p = parseEvent("channel.raid", {
      from_broadcaster_user_id: "r1",
      from_broadcaster_user_login: "r",
      from_broadcaster_user_name: "R",
      viewers: 42,
    });
    expect(p).toMatchObject({
      kind: "credit",
      eventType: "raid",
      userId: "r1",
      amount: 42,
    });
  });

  it("marks anonymous events", () => {
    const p = parseEvent("channel.cheer", {
      user_id: "u1",
      user_login: "u",
      user_name: "U",
      bits: 10,
      is_anonymous: true,
    });
    expect(p).toMatchObject({ kind: "credit", isAnonymous: true });
  });

  it("credits tips from the donation source", () => {
    const p = parseEvent("tip", {
      user_id: "t1",
      user_login: "t",
      user_name: "T",
      amount_cents: 250,
    });
    expect(p).toMatchObject({
      kind: "credit",
      eventType: "tip",
      userId: "t1",
      amount: 250,
    });
  });
});
