# Twitch Leaderboard Overlay

A no-code Twitch leaderboard overlay sold as a hosted product. Streamers sign in
with Twitch, bind a license key, configure everything from a dashboard, and paste
one secure URL into OBS.

- **Dashboard:** license binding, OBS URL, token regeneration, all overlay settings.
- **Overlay:** realtime leaderboard with themes, rotation, and an offline cache.
- **Ingestion:** Twitch EventSub webhooks plus a tip bridge endpoint.
- **Hosting:** Vercel + Supabase only. No customer infrastructure.

## Stack

| Layer | Choice |
|------|--------|
| App | Next.js 16 App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS v4 |
| Data | Supabase Postgres + Realtime |
| Events | Twitch EventSub (Edge webhook), Twitch OAuth |
| Tests | Vitest, Testing Library (jsdom) |

## Local development

```powershell
npm install
Copy-Item .env.example .env.local   # fill in the values
npm run dev
```

Apply `supabase/migrations/0001_init.sql` in the Supabase SQL editor before the
first login. The overlay is license-gated, so also issue yourself a key and bind
it from the dashboard (see `docs/VERCEL_SETUP.md` §5). Full setup (Supabase,
Twitch app, EventSub, Vercel) is in
[`docs/VERCEL_SETUP.md`](docs/VERCEL_SETUP.md).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Unit/component tests |
| `npm run test:watch` | Watch mode |
| `npm run lint` | ESLint |
| `npm run chat-bot` | Long-running Twitch chat command bot |

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing + Twitch sign-in |
| `/dashboard` | License binding, OBS URL, token regeneration |
| `/dashboard/settings` | Display, points, layout, visuals, theme, rotation |
| `/overlay/[token]` | OBS browser source (token-gated) |
| `GET /api/overlay/[token]/data` | Overlay snapshot used for refresh |
| `POST /api/overlay/[token]/command` | Chat bot commands (shared secret) |
| `POST /api/overlay/regenerate` | Rotate the OBS token |
| `POST /api/webhooks/twitch` | EventSub receiver (signature verified) |
| `POST /api/webhooks/tips/[token]` | Donation bridge tip ingestion |
| `GET/PUT /api/settings` | Read/save overlay settings |
| `POST /api/license/validate` | Bind a license to the signed-in account |
| `GET /api/auth/twitch` | Start Twitch OAuth |
| `GET /api/auth/twitch/callback` | OAuth callback |
| `POST /api/auth/logout` | Clear the session |
| `GET /api/health` | Deploy check |

## Points

`config.tip` is **points per whole dollar**; tips arrive in cents and are scaled
by `amountCents / 100`. All other rates are points per unit.

| Event | Source | Credited |
|-------|--------|----------|
| Tip | `/api/webhooks/tips/[token]` | Donor, if `amountCents >= tipThresholdCents` and `> 0` |
| Bits | `channel.cheer` | Cheerer, bits × rate |
| Sub | `channel.subscribe`, `channel.subscription.message` (not gift) | Subscriber, 1 × rate |
| Gift bundle | `channel.subscription.gift` | Gifter, `total` × rate |
| Raid | `channel.raid` | Raider, viewers × rate |

Gift recipients are always ignored, so a gifted bundle is credited once to the
gifter. Anonymous events are stored under the streamer's mask name (never the
real login), including when the mask is blank or cleared. Events worth zero
points (a gift bundle with no `total`, a raid with 0 viewers) are ignored
instead of adding empty leaderboard rows.

## Data and resilience

- `point_events` is an append-only ledger with a unique
  `(streamer_id, twitch_event_id)` key, so retried deliveries are no-ops.
- `flush_streamer_aggregates(uuid, boolean)` recomputes every window under a
  per-streamer advisory lock, at most once per two seconds. A call inside the
  window marks the streamer `flush_pending` instead of writing, and the next
  overlay read drains it (`p_force` skips the throttle for `clear stream`).
- Aggregates are recomputed once per event batch; the overlay refetches a
  throttled snapshot on each broadcast, with a trailing refetch so the last
  event of a burst is never dropped.
- The overlay caches its last payload in `localStorage` and keeps rendering it if
  Realtime or Postgres is unavailable.
- OBS token regeneration replaces `streamers.obs_token` immediately; old URLs stop
  resolving on their next fetch.

## Security model

- Dashboard auth is a signed, httpOnly `lb_session` cookie created by Twitch OAuth.
  The payload carries a 30-day `exp` claim, so a replayed cookie stops working.
- All database access is server-side with the service-role key. RLS is enabled on
  every table as defense-in-depth; anon/authenticated clients get nothing, and
  the recompute function is revoked from `anon`/`authenticated`.
- Overlay data, tip ingestion, and chat commands all require a license that is
  bound, active, and unexpired — a leaked overlay token alone is not enough.
- EventSub requests are verified with HMAC-SHA256 and a 5-minute timestamp window,
  including the callback verification challenge.
- Twitch access tokens are encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`).
- The OBS URL token is 32 random bytes, base64url. It is the overlay channel name
  and the tip endpoint secret — treat it like a password.
- Chat commands require the bot shared secret **and** a broadcaster/moderator badge.
- Secrets are never logged or echoed by an API response.

## Settings

Display toggles (top-25 ranks, medals, rank numbers, bars, amounts), hidden
accounts, five point rates, tip threshold, anonymous mask, layout sliders (width,
padding, radius), visuals (opacity, font size), five theme presets with five HEX
overrides, and window rotation (This Stream → 7 Days → 30 Days → All-Time).

## Chat commands

`!leaderboard refresh` and `!leaderboard clear stream`, broadcaster/moderator only.
The bot is `scripts/chat-bot.ts`; see `docs/VERCEL_SETUP.md` for its env vars.

## Verification

```powershell
npm test
npx tsc --noEmit
npm run build
```
