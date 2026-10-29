"use client";

import { useState } from "react";
import Link from "next/link";
import { SettingsForm } from "./SettingsForm";
import type { OverlaySettings } from "@/lib/types";

type Props = {
  initial: OverlaySettings;
};

type Status = "idle" | "saving" | "saved" | "error";

export function SettingsEditor({ initial }: Props) {
  const [settings, setSettings] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");

  const save = async () => {
    setStatus("saving");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const data = (await response.json()) as { settings: OverlaySettings };
      setSettings(data.settings);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Back to dashboard
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500" aria-live="polite">
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? "Saved — overlay updated"
                : status === "error"
                  ? "Save failed"
                  : "Changes are live after saving"}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={status === "saving"}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            Save settings
          </button>
        </div>
      </div>
      <SettingsForm initial={settings} onChange={setSettings} />
    </div>
  );
}
