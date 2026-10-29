/**
 * Twitch chat command bot.
 *
 * Runs as a long-lived process (not on Vercel). Connects to Twitch IRC over
 * WebSocket, reads mod/broadcaster commands, counts chat messages, and posts
 * them to the app.
 *
 * Required env:
 *   TWITCH_CHAT_BOT_TOKEN   oauth token for the bot account (with or without "oauth:")
 *   TWITCH_CHAT_BOT_USERNAME bot account login
 *   TWITCH_CHANNEL          channel to join, without "#"
 *   OVERLAY_TOKEN           the streamer's OBS token
 *   CHAT_BOT_SECRET         shared secret checked by the command route
 *   NEXT_PUBLIC_APP_URL     deployment origin
 */

import { parseChatCommand, type ChatBadges } from "../src/lib/chatCommands";

const TOKEN = process.env.TWITCH_CHAT_BOT_TOKEN;
const USERNAME = process.env.TWITCH_CHAT_BOT_USERNAME;
const CHANNEL = process.env.TWITCH_CHANNEL;
const OVERLAY_TOKEN = process.env.OVERLAY_TOKEN;
const BOT_SECRET = process.env.CHAT_BOT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const RECONNECT_MS = 5000;

for (const [name, value] of Object.entries({
  TWITCH_CHAT_BOT_TOKEN: TOKEN,
  TWITCH_CHAT_BOT_USERNAME: USERNAME,
  TWITCH_CHANNEL: CHANNEL,
  OVERLAY_TOKEN: OVERLAY_TOKEN,
  CHAT_BOT_SECRET: BOT_SECRET,
})) {
  if (!value) {
    console.error(`[chat-bot] missing required env ${name}`);
    process.exit(1);
  }
}

function parseBadges(raw: string): ChatBadges {
  const badges: ChatBadges = {};
  for (const entry of raw.split(",")) {
    const [name, version] = entry.split("/");
    if (name) badges[name] = version ?? "1";
  }
  return badges;
}

type ChatMessage = {
  userId: string;
  badges: ChatBadges;
  text: string;
};

function parsePrivmsg(line: string): ChatMessage | null {
  const match = /^@([^ ]*) :([^!]+)![^ ]* PRIVMSG [^ ]+ :(.*)$/.exec(line);
  if (!match) return null;

  const tags: Record<string, string> = {};
  for (const pair of match[1].split(";")) {
    const index = pair.indexOf("=");
    if (index > 0) {
      tags[pair.slice(0, index)] = pair.slice(index + 1);
    }
  }

  return {
    userId: tags["user-id"] ?? "",
    badges: parseBadges(tags.badges ?? ""),
    text: match[3],
  };
}

async function postChatEvent(message: ChatMessage): Promise<void> {
  try {
    const response = await fetch(
      `${APP_URL}/api/webhooks/chat/${OVERLAY_TOKEN}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-chat-bot-secret": BOT_SECRET ?? "",
        },
        body: JSON.stringify({
          userId: message.userId,
          username: message.badges["display-name"] || "Viewer",
          isBot: message.badges.bot === "1",
          isBroadcaster: message.badges.broadcaster === "1",
          isMod: message.badges.mod === "1",
        }),
      },
    );
    if (!response.ok) {
      console.warn(
        `[chat-bot] chat event rejected with status ${response.status}`,
      );
    }
  } catch (error) {
    console.error("[chat-bot] chat event request failed", error);
  }
}

async function handleLine(line: string): Promise<void> {
  const message = parsePrivmsg(line);
  if (!message) return;

  // Count every chat message for the chat_messages board
  await postChatEvent(message);

  const parsed = parseChatCommand(message.text);
  if (!parsed) return;

  try {
    const response = await fetch(
      `${APP_URL}/api/overlay/${OVERLAY_TOKEN}/command`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-chat-bot-secret": BOT_SECRET ?? "",
        },
        body: JSON.stringify({
          command: parsed.command,
          userId: message.userId,
          badges: message.badges,
        }),
      },
    );

    if (!response.ok) {
      console.warn(
        `[chat-bot] ${parsed.command} rejected with status ${response.status}`,
      );
    }
  } catch (error) {
    console.error("[chat-bot] command request failed", error);
  }
}

function connect(): void {
  const socket = new WebSocket(IRC_URL);

  socket.addEventListener("open", () => {
    console.log(`[chat-bot] connected, joining #${CHANNEL}`);
    socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    socket.send(`PASS oauth:${(TOKEN ?? "").replace(/^oauth:/, "")}`);
    socket.send(`NICK ${USERNAME}`);
    socket.send(`JOIN #${CHANNEL}`);
  });

  socket.addEventListener("message", (event) => {
    const payload = String(event.data);
    for (const rawLine of payload.split("\r\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("PING")) {
        socket.send("PONG :tmi.twitch.tv");
        continue;
      }
      void handleLine(line);
    }
  });

  socket.addEventListener("error", () => {
    console.error("[chat-bot] socket error");
  });

  socket.addEventListener("close", () => {
    console.warn(`[chat-bot] disconnected, retrying in ${RECONNECT_MS}ms`);
    setTimeout(connect, RECONNECT_MS);
  });
}

connect();