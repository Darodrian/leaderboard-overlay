"use client";

import { useState } from "react";

export function LicenseForm() {
  const [licenseKey, setLicenseKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);

    try {
      const response = await fetch("/api/license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus(data.error ?? "Could not validate this key");
        return;
      }

      window.location.reload();
    } catch {
      setStatus("Could not validate this key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label
        htmlFor="license-key"
        className="block space-y-1 text-sm text-slate-200"
      >
        <span>License key</span>
        <input
          id="license-key"
          type="text"
          value={licenseKey}
          onChange={(event) => setLicenseKey(event.target.value)}
          placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX"
          className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-indigo-400"
        />
      </label>
      <button
        type="submit"
        disabled={busy || licenseKey.trim().length === 0}
        className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
      >
        {busy ? "Binding…" : "Bind license"}
      </button>
      {status ? <p className="text-xs text-rose-300">{status}</p> : null}
      <p className="text-xs text-slate-500">
        A key binds permanently to this Twitch account. Contact the seller if
        you need a transfer.
      </p>
    </form>
  );
}
