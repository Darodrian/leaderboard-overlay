# Vercel + Supabase + Twitch setup

Everything is hosted on Vercel and Supabase. The only process you run yourself is
the optional Twitch chat bot.

## 0. Prerequisites

- Node.js 20+ (24 recommended), npm 10+
- A Supabase project
- A Twitch application
- A Vercel account connected to this repository

## 1. Supabase

1. Create a project and note the project URL, anon key, and service-role key
   (Project Settings → API).
2. Open the SQL editor and run
   [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
   It creates six tables, enables RLS on every one, and adds
   `flush_streamer_aggregates(uuid)`.
3. Enable Realtime for broadcasts (Realtime is used for server → overlay messages,
   not Postgres changes): Project Settings → Realtime is on by default on paid and
   free plans; no table publication is required.

### Verify RLS (run once per project)

The app talks to Postgres only with the service-role key. RLS matters as a second
line of defense. This procedure proves cross-streamer reads return nothing.

```sql
-- Run in the SQL editor (service role): two fixtures.
insert into streamers (twitch_user_id, twitch_login, obs_token, license_key)
values ('1001', 'alpha', 'tok-alpha', 'LB-A'),
       ('1002', 'beta',  'tok-beta',  'LB-B');

insert into point_events
  (streamer_id, twitch_event_id, event_type, credited_user_id,
   credited_username, points_awarded)
select id, 'evt-1', 'bit', 'u1', 'Alice', 10
from streamers where twitch_login = 'alpha';

-- Impersonate "alpha" and confirm isolation.
begin;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select id::text from streamers where twitch_login = 'alpha'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;
select count(*) as own_events from point_events;            -- expect 1
select count(*) as beta_events
from point_events p
join streamers s on s.id = p.streamer_id
where s.twitch_login = 'beta';                              -- expect 0
rollback;

-- Clean up the fixtures.
delete from streamers where twitch_login in ('alpha', 'beta');
```

Repeat with `'beta'` in place of `'alpha'` and expect the inverse. If counts are
larger, a policy is missing; re-run the migration.

## 2. Twitch application

1. Create an app at <https://dev.twitch.tv/console/apps>.
2. Add an OAuth redirect URL: `https://YOUR_DOMAIN/api/auth/twitch/callback`
   (and `http://localhost:3000/api/auth/twitch/callback` for local work).
3. Copy the client ID and generate a client secret.
4. Category: any (e.g. "Broadcasting" is not required for personal use).

The app requests `user:read:email` and `moderator:read:chatters`.

## 3. Deploy to Vercel

1. Import the repository into Vercel (framework preset: Next.js).
2. Add environment variables for Production (and Preview if desired):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server only) |
| `TWITCH_CLIENT_ID` | Twitch app client ID |
| `TWITCH_CLIENT_SECRET` | Twitch app client secret |
| `TWITCH_WEBHOOK_SECRET` | 10–100 random characters you choose |
| `TWITCH_REDIRECT_URI` | Optional; defaults to `<origin>/api/auth/twitch/callback` |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64 |
| `CHAT_BOT_SECRET` | Random shared secret for the bot |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR_DOMAIN` |

Generate the two secrets:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"
```

3. Deploy. `GET https://YOUR_DOMAIN/api/health` must return `{"status":"ok"}`.

## 4. EventSub subscriptions

Create the subscriptions after the deployment is reachable, using an app access
token. Twitch calls the webhook immediately with a challenge, which
`/api/webhooks/twitch` answers.

```powershell
$body = "client_id=$env:TWITCH_CLIENT_ID&client_secret=$env:TWITCH_CLIENT_SECRET&grant_type=client_credentials"
$token = (curl.exe -s -X POST "https://id.twitch.tv/oauth2/token" `
  -H "Content-Type: application/x-www-form-urlencoded" -d $body | ConvertFrom-Json).access_token

$env:TWITCH_BROADCASTER_ID = "YOUR_TWITCH_NUMERIC_ID"
$env:TWITCH_WEBHOOK_SECRET = "same-value-as-vercel"
$env:PUBLIC_ORIGIN = "https://YOUR_DOMAIN"

function New-EventSub($type, $version) {
  $payload = @{
    type = $type
    version = $version
    condition = @{ broadcaster_user_id = $env:TWITCH_BROADCASTER_ID }
    transport = @{
      method = "webhook"
      callback = "$env:PUBLIC_ORIGIN/api/webhooks/twitch"
      secret = $env:TWITCH_WEBHOOK_SECRET
    }
  } | ConvertTo-Json -Depth 5

  curl.exe -s -X POST "https://api.twitch.tv/helix/eventsub/subscriptions" `
    -H "Client-Id: $env:TWITCH_CLIENT_ID" `
    -H "Authorization: Bearer $token" `
    -H "Content-Type: application/json" -d $payload
}

New-EventSub "channel.subscribe" 1
New-EventSub "channel.subscription.gift" 1
New-EventSub "channel.subscription.message" 1
New-EventSub "channel.cheer" 1
New-EventSub "channel.raid" 1
```

Notes:

- `channel.raid` uses the raider's `from_broadcaster_*` fields; the condition is
  still your channel.
- Gifted bundles credit the gifter once via `channel.subscription.gift`. The
  recipient's `channel.subscribe`/`channel.subscription.message` with
  `is_gift: true` is ignored.
- List active subscriptions with
  `curl.exe -s "https://api.twitch.tv/helix/eventsub/subscriptions" -H "Client-Id: ..." -H "Authorization: Bearer $token"`.

## 5. License keys

Issue one row per Etsy sale:

```sql
insert into licenses (key, is_active) values ('LB-XXXX-XXXX-XXXX', true);
```

Customer flow: sign in with Twitch → paste the key in the dashboard → the key
binds permanently to that Twitch user ID. A different account gets HTTP 409.
Deactivate with `update licenses set is_active = false where key = '...';`.

## 6. OBS

1. In the dashboard, copy the overlay URL (after binding a license).
2. Add a Browser Source at 1280×720, paste the URL, enable "Shutdown source when
   not visible" off, and set a transparent background.
3. Multiple scenes may reuse the same URL.
4. "Regenerate token" swaps `streamers.obs_token` immediately. Every old URL 404s
   on its next fetch; update all OBS sources.

## 7. Tips

Tips enter through a bridge endpoint:

```powershell
$payload = @{
  eventId = "donation-123"       # stable per donation; retries are deduplicated
  userId = "twitch-or-provider-id"
  username = "Alice"
  amountCents = 500
  isAnonymous = $false
} | ConvertTo-Json

curl.exe -s -X POST "https://YOUR_DOMAIN/api/webhooks/tips/OVERLAY_TOKEN" `
  -H "Content-Type: application/json" -d $payload
```

`OVERLAY_TOKEN` is the token from the OBS URL, so treat that URL as a password.
Tips below the configured threshold or at zero are ignored. Map your donation
provider's webhook to this shape (most providers expose a stable transaction ID
and an amount — convert to cents).

## 8. Chat bot

Run this process somewhere long-lived (your PC, a small VPS, a home server). It is
not deployed to Vercel.

```powershell
$env:TWITCH_CHAT_BOT_TOKEN = "oauth:..."   # bot account token
$env:TWITCH_CHAT_BOT_USERNAME = "yourbot"
$env:TWITCH_CHANNEL = "yourchannel"
$env:OVERLAY_TOKEN = "the OBS token"
$env:CHAT_BOT_SECRET = "same-value-as-vercel"
$env:NEXT_PUBLIC_APP_URL = "https://YOUR_DOMAIN"
npm run chat-bot
```

The bot account must be a moderator in the channel (or be the broadcaster).
Commands:

- `!leaderboard refresh` — force every overlay to refetch.
- `!leaderboard clear stream` — deactivate the current This Stream window, start a
  fresh one, and recompute aggregates.

Anything else is ignored. Non-moderators are rejected even if they send the
command.

## 9. Deploy checklist

- [ ] Migration applied; `flush_streamer_aggregates` exists.
- [ ] RLS verification returns 1/0 for each fixture owner.
- [ ] All Vercel env vars set; `/api/health` returns ok.
- [ ] Twitch redirect URL matches exactly.
- [ ] EventSub subscriptions active and verified (no `webhook_callback_verification` failures).
- [ ] A test cheer, sub, gift, and raid appear on the overlay.
- [ ] A test tip below the threshold is ignored; one above appears.
- [ ] Token regeneration makes the old overlay URL 404.
- [ ] Overlay keeps the last rows when Supabase is paused (offline fallback).
- [ ] Chat bot refreshes and clears with a mod account; a viewer is rejected.
- [ ] `npm test`, `npx tsc --noEmit`, and `npm run build` are green before shipping.

## Known gaps

- The tip bridge is generic; provider-specific adapters (StreamElements,
  Streamlabs, Ko-fi) are not included.
- RLS policies assume a future Supabase-Auth session. Today the server uses the
  service-role key and policies are defense-in-depth only.
- The webhook runs on the Edge runtime, which Next 16 marks deprecated. It still
  builds; migrate to the Node runtime when Edge support is removed.
