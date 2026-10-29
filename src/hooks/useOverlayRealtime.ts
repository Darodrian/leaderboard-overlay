"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OverlayState } from "@/lib/types";

const REFRESH_THROTTLE_MS = 400;
const PENDING_RETRY_MS = 2100;

export function useOverlayRealtime(token: string, initial: OverlayState) {
  const [state, setState] = useState<OverlayState>(initial);
  const [connected, setConnected] = useState(false);
  const [hasLiveData, setHasLiveData] = useState(false);
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    let canceled = false;
    let removeChannel: (() => void) | null = null;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    // Trailing throttle: a broadcast inside the window schedules one refetch
    // for the end of the window instead of dropping the last event.
    const refresh = async () => {
      const now = Date.now();
      const elapsed = now - lastRefresh.current;
      if (elapsed < REFRESH_THROTTLE_MS) {
        if (trailing === null) {
          trailing = setTimeout(() => {
            trailing = null;
            void refresh();
          }, REFRESH_THROTTLE_MS - elapsed);
        }
        return;
      }
      lastRefresh.current = now;

      try {
        const response = await fetch(`/api/overlay/${token}/data`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as OverlayState;
        if (canceled) return;

        setState(data);
        setHasLiveData(true);

        // The server throttles aggregate writes to one per two seconds, so a
        // skipped flush reports pending; come back once the window has passed.
        if (data.pending) {
          if (retry !== null) clearTimeout(retry);
          retry = setTimeout(() => {
            retry = null;
            lastRefresh.current = 0;
            void refresh();
          }, PENDING_RETRY_MS);
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
      // Stay on the cached payload; the connection is already reported false.
    }

    return () => {
      canceled = true;
      if (trailing !== null) clearTimeout(trailing);
      if (retry !== null) clearTimeout(retry);
      removeChannel?.();
    };
  }, [token]);

  return { state, connected, hasLiveData };
}
