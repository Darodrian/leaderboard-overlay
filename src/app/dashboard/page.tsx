import Link from "next/link";
import { redirect } from "next/navigation";
import { LicenseForm } from "@/components/dashboard/LicenseForm";
import { OverlayUrlPanel } from "@/components/dashboard/OverlayUrlPanel";
import { getSession } from "@/lib/sessionCookie";
import { loadStreamerById } from "@/lib/streamerStore";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const streamer = await loadStreamerById(session.streamerId);
  if (!streamer) redirect("/");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const overlayUrl = new URL(`/overlay/${streamer.obsToken}`, baseUrl).toString();
  const licensed = streamer.licenseKey !== null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">
            Leaderboard dashboard
          </h1>
          <p className="text-sm text-slate-400">
            Signed in as{" "}
            <span className="font-medium text-slate-200">
              {streamer.twitchLogin}
            </span>
          </p>
        </div>
        <Link
          href="/dashboard/settings"
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/60"
        >
          Settings
        </Link>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          License
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          {licensed
            ? "Licensed — this key is permanently bound to your Twitch account."
            : "No license bound yet. Enter the key from your purchase to activate the overlay."}
        </p>
        {licensed ? null : (
          <div className="mt-3">
            <LicenseForm />
          </div>
        )}
      </section>

      {licensed ? (
        <OverlayUrlPanel url={overlayUrl} />
      ) : (
        <section className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-500">
          The OBS URL appears here once a license is bound.
        </section>
      )}
    </main>
  );
}
