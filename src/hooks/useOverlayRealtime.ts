"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OverlayState } from "@/lib/types";

const REFRESH_THROTTLE_MS = 400;

export function useOverlayRealtime(token: string, initial: OverlayState) {
  const [state, setState] = useState<OverlayState>(initial);
  const [connected, setConnected] = useState(false);
  const [hasLiveData, setHasLiveData] = useState(false);
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    let canceled = false;
    let removeChannel: (() => void) | null = null;

    const refresh = async () => {
      const now = Date.now();
      if (now - lastRefresh.current < REFRESH_THROTTLE_MS) return;
      lastRefresh.current = now;

      try {
        const response = await fetch(`/api/overlay/${token}/data`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as OverlayState;
        if (!canceled) {
          setState(data);
          setHasLiveData(true);
        }
      } catch {
        // Keep showing the cached payload instead of blanking the overlay.
      }
    };

    try {
      const supabase = createClient();
      const channel = supabase.channel(`overlay:${token}`);

      channel
        .on("broadcast", { event: "leaderboard.update" }, () => void refresh())
        .on("broadcast", { event: "settings.update" }, () => void refresh())
        .on("broadcast", { event: "command.refresh" }, () => void refresh())
        .on("broadcast", { event: "command.clear-stream" }, () => void refresh())
        .subscribe((status) => {
          if (!canceled) setConnected(status === "SUBSCRIBED");
        });

      removeChannel = () => {
        void supabase.removeChannel(channel);
      };

      void refresh();
    } catch {
      setConnected(false);
    }

    return () => {
      canceled = true;
      removeChannel?.();
    };
  }, [token]);

  return { state, connected, hasLiveData };
}
