"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Leaderboard } from "./Leaderboard";
import { useLocalCache } from "@/hooks/useLocalCache";
import { useOverlayRealtime } from "@/hooks/useOverlayRealtime";
import { cssVars, nextRotationWindow } from "@/lib/settings";
import type { OverlayState, WindowType } from "@/lib/types";

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
  const [activeWindow, setActiveWindow] = useState<WindowType>(state.window);

  useEffect(() => {
    if (live.hasLiveData) setCached(live.state);
  }, [live.hasLiveData, live.state, setCached]);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    setActiveWindow(state.window);
  }, [state.window]);

  useEffect(() => {
    if (!state.settings.rotation.enabled) return;
    const id = window.setInterval(() => {
      setActiveWindow((current) => nextRotationWindow(current));
    }, state.settings.rotation.intervalMs);
    return () => window.clearInterval(id);
  }, [state.settings.rotation.enabled, state.settings.rotation.intervalMs]);

  const rows = state.windows?.[activeWindow] ?? state.rows;

  return (
    <div
      className="lb-root"
      style={cssVars(state.settings) as unknown as CSSProperties}
      data-connection={live.connected ? "live" : "cached"}
    >
      {state.settings.rotation.enabled ? (
        <div className="lb-window">{WINDOW_LABELS[activeWindow]}</div>
      ) : null}
      <div className="lb-panel" key={activeWindow}>
        <Leaderboard rows={rows} settings={state.settings} window={activeWindow} />
      </div>
    </div>
  );
}
