export type ChatCommand = "refresh" | "clear-stream";

export type ChatBadges = Record<string, string>;

export type CommandDeps = {
  clearStreamWindow: (streamerId: string) => Promise<void>;
  broadcast: (
    streamerId: string,
    event: "command.refresh" | "command.clear-stream",
    payload: Record<string, unknown>,
  ) => Promise<void>;
};

export type ApplyCommandInput = {
  streamerId: string;
  command: ChatCommand;
  badges: ChatBadges;
  userId: string;
  broadcasterId: string;
};

export function parseChatCommand(text: string): { command: ChatCommand } | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "!leaderboard refresh") return { command: "refresh" };
  if (normalized === "!leaderboard clear stream") {
    return { command: "clear-stream" };
  }
  return null;
}

export function canModerate(
  badges: ChatBadges,
  userId: string,
  broadcasterId: string,
): boolean {
  if (userId && userId === broadcasterId) return true;
  return Boolean(badges.broadcaster || badges.moderator);
}

export async function applyCommand(
  deps: CommandDeps,
  input: ApplyCommandInput,
): Promise<"applied" | "rejected"> {
  if (!canModerate(input.badges, input.userId, input.broadcasterId)) {
    return "rejected";
  }

  const event =
    input.command === "refresh" ? "command.refresh" : "command.clear-stream";

  if (input.command === "clear-stream") {
    await deps.clearStreamWindow(input.streamerId);
  }

  await deps.broadcast(input.streamerId, event, { type: event });

  return "applied";
}
