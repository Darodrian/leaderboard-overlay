"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Leaderboard } from "./Leaderboard";
import { useLocalCache } from "@/hooks/useLocalCache";
import { useOverlayRealtime } from "@/hooks/useOverlayRealtime";
import { cssVars, BOARD_LABELS } from "@/lib/settings";
import type { BoardType, OverlayState, ScreenLayout, WindowType } from "@/lib/types";

const WINDOW_LABELS: Record<WindowType, string> = {
  this_stream: "This Stream",
  "7d": "7 Days",
  "30d": "30 Days",
  alltime: "All-Time",
};

type Props = {
  token: string;
  initial: OverlayState;
};

export function OverlayClient({ token, initial }: Props) {
  const [cached, setCached] = useLocalCache<OverlayState>(
    `overlay:${token}`,
    initial,
  );
  const live = useOverlayRealtime(token, cached);
  const state = live.hasLiveData ? live.state : cached;

  // Read optional viewer ID from URL for view time tracking
  const viewerId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("viewer") || undefined
    : undefined;

  // Heartbeat for view time tracking
  useEffect(() => {
    if (!viewerId) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let visibilityHandler: (() => void) | null = null;
    let beforeUnloadHandler: (() => void) | null = null;

    const sendHeartbeat = async () => {
      try {
        await fetch(`/api/overlay/${token}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ twitchUserId: viewerId, username: "Viewer" }),
        });
      } catch {
        // Ignore heartbeat failures
      }
    };

    const start = () => {
      sendHeartbeat();
      timer = setInterval(sendHeartbeat, 30000);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    // Send heartbeat on page unload
    const handleBeforeUnload = () => {
      sendHeartbeat();
      stop();
    };

    visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
        sendHeartbeat(); // Final heartbeat when tab becomes hidden
      }
    };

    beforeUnloadHandler = handleBeforeUnload;

    start();

    document.addEventListener("visibilitychange", visibilityHandler);
    window.addEventListener("beforeunload", beforeUnloadHandler);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibilityHandler);
      window.removeEventListener("beforeunload", beforeUnloadHandler);
    };
  }, [token, viewerId]);

  const activeBoards = Object.entries(state.settings.boards).filter(
    ([, cfg]) => cfg.active,
  );
  const boardTypes = activeBoards.map(([bt]) => bt as BoardType);

  // For single layout with rotation, track which board/window is active
  const [rotation, setRotation] = useState<{
    currentBoard: BoardType;
    currentWindow: WindowType;
  }>({
    currentBoard: state.activeBoard,
    currentWindow: state.activeWindow,
  });

  const isSingle = state.settings.screenLayout === "single";
  const activeBoard = isSingle ? rotation.currentBoard : boardTypes[0];
  const activeWindow = isSingle ? rotation.currentWindow : state.activeWindow;

  const boardState = state.boards[activeBoard];
  const boardCfg = state.settings.boards[activeBoard];
  const rankCount = boardCfg?.rankCount ?? 25;
  const rows = boardState?.rows.slice(0, rankCount) ?? [];

  useEffect(() => {
    if (live.hasLiveData) setCached(live.state);
  }, [live.hasLiveData, live.state, setCached]);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    if (!state.settings.rotation.enabled || !isSingle) return;
    const id = window.setInterval(() => {
      setRotation((previous) => {
        const settings = state.settings;

        let nextBoard = previous.currentBoard;
        let nextWindow = previous.currentWindow;

        if (settings.rotationMode === "boards" || settings.rotationMode === "both") {
          const boardIndex = boardTypes.indexOf(previous.currentBoard);
          const nextBoardIndex =
            boardIndex === -1 || boardIndex === boardTypes.length - 1
              ? 0
              : boardIndex + 1;
          nextBoard = boardTypes[nextBoardIndex];
          nextWindow =
            state.boards[nextBoard]?.window ?? previous.currentWindow;
        }

        if (settings.rotationMode === "windows" || settings.rotationMode === "both") {
          if (settings.rotationMode === "windows") {
            nextBoard = previous.currentBoard;
          }
          const boardWindows =
            settings.boards[nextBoard]?.windows ?? ["this_stream"];
          const windowIndex = boardWindows.indexOf(previous.currentWindow);
          const nextWindowIndex =
            windowIndex === -1 || windowIndex === boardWindows.length - 1
              ? 0
              : windowIndex + 1;
          nextWindow = boardWindows[nextWindowIndex];
        }

        return {
          currentBoard: nextBoard,
          currentWindow: nextWindow,
        };
      });
    }, state.settings.rotation.intervalMs);
    return () => window.clearInterval(id);
  }, [
    state.settings.rotation.enabled,
    state.settings.rotation.intervalMs,
    isSingle,
    boardTypes,
    state.activeBoard,
    state.activeWindow,
    state.settings.boards,
    state.settings.rotationMode,
  ]);

  const renderBoard = (board: BoardType, window: WindowType) => {
    const bs = state.boards[board];
    const bc = state.settings.boards[board];
    const rc = bc?.rankCount ?? 25;
    const boardRows = bs?.rows.slice(0, rc) ?? [];

    return (
      <div
        key={board}
        className="flex-1 min-w-0"
      >
        {state.settings.rotation.enabled && isSingle ? (
          <div className="lb-window mb-1">
            {BOARD_LABELS[board]} â€” {WINDOW_LABELS[window]}
          </div>
        ) : null}
        {bs ? (
          <Leaderboard
            rows={boardRows}
            board={board}
            settings={state.settings}
            window={window}
          />
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="lb-root"
      style={cssVars(state.settings) as unknown as CSSProperties}
      data-connection={live.connected ? "live" : "cached"}
    >
      {state.settings.screenLayout === "side-by-side" && (
        <div className="flex flex-col lg:flex-row gap-2">
          {boardTypes.map((board) => renderBoard(board, state.activeWindow))}
        </div>
      )}
      {state.settings.screenLayout === "stacked" && (
        <div className="flex flex-col gap-2">
          {boardTypes.map((board) => renderBoard(board, state.activeWindow))}
        </div>
      )}
      {state.settings.screenLayout === "single" && (
        <div className="lb-panel">
          {boardState ? renderBoard(activeBoard, activeWindow) : null}
        </div>
      )}
    </div>
  );
}

