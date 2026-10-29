"use client";

import { useState } from "react";

type Props = {
  url: string;
};

export function OverlayUrlPanel({ url }: Props) {
  const [current, setCurrent] = useState(url);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current);
      setMessage("Copied to clipboard");
    } catch {
      setMessage("Copy failed — select the URL manually");
    }
  };

  const regenerate = async () => {
    if (
      !window.confirm(
        "Regenerate the overlay URL? Every OBS source using the old URL stops updating.",
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/overlay/regenerate", { method: "POST" });
      if (!response.ok) {
        setMessage("Regeneration failed");
        return;
      }
      const data = (await response.json()) as { url: string };
      setCurrent(data.url);
      setMessage("New URL active — update your OBS browser source");
    } catch {
      setMessage("Regeneration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        OBS overlay URL
      </h2>
      <code className="block overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
        {current}
      </code>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400"
        >
          Copy URL
        </button>
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          className="rounded-lg border border-rose-500/60 px-3 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
        >
          {busy ? "Regenerating…" : "Regenerate token"}
        </button>
      </div>
      {message ? <p className="text-xs text-slate-400">{message}</p> : null}
      <p className="text-xs text-slate-500">
        Paste this into an OBS Browser Source at 1280×720 with a transparent
        background. Multiple scenes can share the same URL.
      </p>
    </section>
  );
}
