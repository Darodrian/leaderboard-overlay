import "server-only";
import { licenseIsActive } from "./access";
import { tokenIsValid } from "./licensing";
import { mapStreamerRow, toOverlaySettings, type StreamerRow } from "./streamers";
import { createAdminClient } from "./supabase/admin";
import type {
  BoardConfig,
  BoardState,
  BoardType,
  LeaderboardRow,
  OverlayState,
  WindowType,
} from "./types";
import { DEFAULT_BOARD_CONFIG, DEFAULT_BOARDS } from "./settings";

export const WINDOW_TYPES: WindowType[] = [
  "this_stream",
  "7d",
  "30d",
  "alltime",
];

export const ALL_BOARD_TYPES: BoardType[] = [
  "points",
  "donations",
  "bits",
  "subs",
  "raiders",
  "view_time",
  "chat_messages",
  "clips",
];

type StreamerRowWithFlush = StreamerRow & { flush_pending?: boolean };

export async function loadOverlayState(
  token: string,
): Promise<OverlayState | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("streamers")
    .select("*")
    .eq("obs_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const streamer = mapStreamerRow(data as StreamerRow);
  if (!tokenIsValid({ token: streamer.obsToken, isActive: true }, token)) {
    return null;
  }
  if (!(await licenseIsActive(streamer.licenseKey))) return null;

  let pending = false;
  if ((data as StreamerRowWithFlush).flush_pending) {
    const { data: flushed, error: flushError } = await supabase.rpc(
      "flush_streamer_aggregates",
      { p_streamer_id: streamer.id },
    );
    if (flushError) {
      throw new Error(`aggregate flush failed: ${flushError.message}`);
    }
    pending = flushed === false;
  }

  const { data: aggregateRows, error: aggregateError } = await supabase
    .from("leaderboard_aggregates")
    .select("window_type,board_type,user_id,username,quantity,last_event_at")
    .eq("streamer_id", streamer.id);

  if (aggregateError) {
    throw new Error(`aggregate query failed: ${aggregateError.message}`);
  }

  // Group rows by board_type, then by window_type
  const boardRows: Record<BoardType, Record<WindowType, LeaderboardRow[]>> = {} as Record<
    BoardType,
    Record<WindowType, LeaderboardRow[]>
  >;
  for (const boardType of ALL_BOARD_TYPES) {
    boardRows[boardType] = {} as Record<WindowType, LeaderboardRow[]>;
    for (const window of WINDOW_TYPES) {
      boardRows[boardType][window] = [];
    }
  }

  for (const row of aggregateRows ?? []) {
    const boardType = row.board_type as BoardType;
    const window = row.window_type as WindowType;
    if (!boardRows[boardType]?.[window]) continue;
    boardRows[boardType][window].push({
      userId: row.user_id,
      username: row.username,
      quantity: row.quantity,
      lastEventAt: row.last_event_at,
    });
  }

  // Sort each board's rows by quantity desc
  for (const boardType of ALL_BOARD_TYPES) {
    for (const window of WINDOW_TYPES) {
      boardRows[boardType][window].sort((a, b) => b.quantity - a.quantity);
    }
  }

  // Build BoardState per board type, applying rank count limits
  const boards: Record<BoardType, BoardState> = {} as Record<BoardType, BoardState>;
  const boardConfigs = streamer.boards ?? {};

  for (const boardType of ALL_BOARD_TYPES) {
    const boardCfg: BoardConfig =
      ((boardConfigs as Record<string, BoardConfig | undefined>)[boardType] ??
        DEFAULT_BOARDS[boardType] as BoardConfig | undefined) ??
      DEFAULT_BOARD_CONFIG;
    const activeWindows = boardCfg.windows;
    const rankCount = boardCfg.rankCount;

    // Use the first active window as the default window for this board
    const defaultWindow = activeWindows[0] ?? "this_stream";
    const rows = boardRows[boardType][defaultWindow].slice(0, rankCount);

    boards[boardType] = {
      rows,
      window: defaultWindow,
      rankCount,
    };
  }

  // Determine the active board (first active one, or points)
  const activeBoard: BoardType =
    ALL_BOARD_TYPES.find((bt) => boardConfigs[bt]?.active) ?? "points";

  return {
    boards,
    settings: toOverlaySettings(streamer),
    activeBoard,
    activeWindow: boards[activeBoard]?.window ?? "this_stream",
    pending,
  };
}
