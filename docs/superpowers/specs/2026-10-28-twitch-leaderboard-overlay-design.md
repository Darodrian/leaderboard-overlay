# Twitch Leaderboard Overlay — Design

**Status:** Approved blueprint (2026-10-28)
**Plan:** `docs/superpowers/plans/2026-10-28-twitch-leaderboard-overlay.md`

## Intent

Sell a no-code Twitch leaderboard overlay to streamers as a SaaS product through Etsy. Customers never touch code: they buy a license key, log into a hosted dashboard with Twitch, and paste a secure URL into OBS.

## Goals

- Centralized Next.js dashboard on Vercel; no customer-hosted infrastructure.
- Supabase Postgres as source of truth; Supabase Realtime for OBS updates.
- Twitch EventSub webhooks drive point awards.
- Precise gifted-sub accounting (credit gifter only, no double count).
- Crash-proof totals, multi-scene sync, offline overlay fallback.
- Commercial licensing with permanent 1:1 Twitch binding and revocable OBS tokens.
- Chat moderator commands for refresh and stream reset.

## Non-goals

- Self-hosted deployments.
- Raw code export to customers.
- Crediting gift recipients.
- Unthrottled database writes during high-volume streams.

## Surfaces

| Surface | Route / host | Purpose |
|---------|--------------|---------|
| Landing | `/` | Marketing + login entry |
| Dashboard | `/dashboard` | License binding, token management |
| Settings | `/dashboard/settings` | All overlay configuration |
| Overlay | `/overlay/[token]` | OBS Browser Source |
| EventSub webhook | `/api/webhooks/twitch` | Twitch event ingestion |
| Health | `/api/health` | Deploy check |

## Data model

`streamers`, `licenses`, `overlay_sessions`, `point_events` (immutable ledger, idempotent on `(streamer_id, twitch_event_id)`), `stream_windows`, `leaderboard_aggregates`.

## Event handling

- Verify HMAC signature + timestamp skew before parsing.
- `channel.subscription.gift` → credit gifter `user_id` with `event.total`.
- `channel.subscription.message` with `is_gift === true` → ignore (recipient).
- `channel.cheer` → credit bits; `channel.subscription` → credit one sub; `channel.raid` → credit raider.
- Tips below `tip_threshold_cents` ignored.
- Anonymous events use the streamer's mask string.
- Aggregate writes debounced to at most one flush per streamer per 2 s.
- Broadcast `leaderboard.update` on `overlay:{streamer_id}`.

## Licensing

License keys are generated out-of-band. On first login a key binds permanently to one Twitch user ID. OBS URLs use `crypto.randomBytes(32).toString("base64url")`; regeneration invalidates the old URL immediately.

## Overlay settings payload

Display toggles, hidden accounts, point values, layout/visual sliders, theme preset + HEX overrides, rotation config. Dashboard writes → Supabase Realtime → overlay applies CSS custom properties and re-renders. Rotation cycles This Stream → 7 Days → 30 Days → All-Time with CSS transitions.

## Resilience

- Ledger is append-only, so totals survive crashes.
- Every OBS instance shares the realtime channel → multi-scene sync.
- Overlay caches the last payload in `localStorage`; on DB/Realtime failure it renders cached data and shows an offline indicator.

## Chat commands

- `!leaderboard refresh` — broadcast refresh; overlay re-fetches.
- `!leaderboard clear stream` — broadcaster/mods only; zero the This Stream window.

## Constraints

Vercel + Supabase only; money in integer cents; points non-negative integers; RLS on every table; never log secrets.
