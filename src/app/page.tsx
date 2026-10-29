import Link from "next/link";
import { getSession } from "@/lib/sessionCookie";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  twitch_login_failed: "Twitch sign-in failed. Please try again.",
  twitch_not_configured: "Twitch OAuth is not configured on this deployment.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Twitch leaderboard overlay
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-50">
            Your community&apos;s top supporters, live in OBS.
          </h1>
          <p className="text-slate-400">
            Tips, bits, subs, gifted subs, and raids in one browser source.
            Configure everything without touching code.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {ERRORS[error] ?? "Something went wrong. Please try again."}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {session ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              Open dashboard
            </Link>
          ) : (
            <a
              href="/api/auth/twitch"
              className="rounded-lg bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              Sign in with Twitch
            </a>
          )}
          <span className="text-xs text-slate-500">
            Already bought a key? Sign in, then bind it in the dashboard.
          </span>
        </div>

        <ul className="grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
          <li>Crash-proof totals from an append-only ledger.</li>
          <li>Multiple OBS scenes stay in sync in real time.</li>
          <li>Overlay keeps the last data when the network drops.</li>
          <li>Moderator commands: refresh and reset this stream.</li>
        </ul>
      </div>
    </main>
  );
}
