import { redirect } from "next/navigation";
import { SettingsEditor } from "@/components/dashboard/SettingsEditor";
import { getSession } from "@/lib/sessionCookie";
import { loadStreamerById } from "@/lib/streamerStore";
import { toOverlaySettings } from "@/lib/streamers";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const streamer = await loadStreamerById(session.streamerId);
  if (!streamer) redirect("/");

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">
          Overlay settings
        </h1>
        <p className="text-sm text-slate-400">
          Everything here is applied live to every OBS browser source.
        </p>
      </header>
      <SettingsEditor initial={toOverlaySettings(streamer)} />
    </main>
  );
}
