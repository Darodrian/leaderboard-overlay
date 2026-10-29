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
  const [rotation, setRotation] = useState<{
    base: WindowType;
    current: WindowType;
  }>({ base: state.window, current: state.window });
  const activeWindow =
    rotation.base === state.window ? rotation.current : state.window;

  useEffect(() => {
    if (live.hasLiveData) setCached(live.state);
  }, [live.hasLiveData, live.state, setCached]);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    if (!state.settings.rotation.enabled) return;
    const id = window.setInterval(() => {
      setRotation((previous) => {
        const base = state.window;
        const current =
          previous.base === base ? previous.current : state.window;
        return { base, current: nextRotationWindow(current) };
      });
    }, state.settings.rotation.intervalMs);
    return () => window.clearInterval(id);
  }, [
    state.settings.rotation.enabled,
    state.settings.rotation.intervalMs,
    state.window,
  ]);

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
