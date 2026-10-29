import { describe, it, expect, vi } from "vitest";
import {
  applyCommand,
  canModerate,
  parseChatCommand,
  type CommandDeps,
} from "./chatCommands";

describe("parseChatCommand", () => {
  it("parses refresh and clear-stream", () => {
    expect(parseChatCommand("!leaderboard refresh")).toEqual({
      command: "refresh",
    });
    expect(parseChatCommand("!leaderboard clear stream")).toEqual({
      command: "clear-stream",
    });
  });

  it("is case-insensitive and tolerates extra whitespace", () => {
    expect(parseChatCommand("  !Leaderboard   REFRESH ")).toEqual({
      command: "refresh",
    });
    expect(parseChatCommand("!leaderboard clear  stream")).toEqual({
      command: "clear-stream",
    });
  });

  it("ignores non-commands and unknown subcommands", () => {
    expect(parseChatCommand("hello")).toBeNull();
    expect(parseChatCommand("!leaderboard")).toBeNull();
    expect(parseChatCommand("!leaderboard dance")).toBeNull();
  });
});

describe("canModerate", () => {
  it("only lets the broadcaster and mods through", () => {
    expect(canModerate({ broadcaster: "1" }, "u", "b")).toBe(true);
    expect(canModerate({ moderator: "1" }, "u", "b")).toBe(true);
    expect(canModerate({}, "u", "b")).toBe(false);
  });

  it("allows the broadcaster by id even without badges", () => {
    expect(canModerate({}, "b", "b")).toBe(true);
  });
});

function deps(): CommandDeps {
  return {
    clearStreamWindow: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn().mockResolvedValue(undefined),
  };
}

const base = {
  streamerId: "s1",
  userId: "u1",
  broadcasterId: "b1",
};

describe("applyCommand", () => {
  it("rejects a non-moderator", async () => {
    const d = deps();
    const result = await applyCommand(d, {
      ...base,
      badges: {},
      command: "clear-stream",
    });

    expect(result).toBe("rejected");
    expect(d.clearStreamWindow).not.toHaveBeenCalled();
    expect(d.broadcast).not.toHaveBeenCalled();
  });

  it("clears the stream window and broadcasts for a mod", async () => {
    const d = deps();
    const result = await applyCommand(d, {
      ...base,
      badges: { moderator: "1" },
      command: "clear-stream",
    });

    expect(result).toBe("applied");
    expect(d.clearStreamWindow).toHaveBeenCalledWith("s1");
    expect(d.broadcast).toHaveBeenCalledWith(
      "s1",
      "command.clear-stream",
      expect.objectContaining({ type: "command.clear-stream" }),
    );
  });

  it("only broadcasts for refresh", async () => {
    const d = deps();
    const result = await applyCommand(d, {
      ...base,
      badges: { broadcaster: "1" },
      command: "refresh",
    });

    expect(result).toBe("applied");
    expect(d.clearStreamWindow).not.toHaveBeenCalled();
    expect(d.broadcast).toHaveBeenCalledWith(
      "s1",
      "command.refresh",
      expect.objectContaining({ type: "command.refresh" }),
    );
  });
});
