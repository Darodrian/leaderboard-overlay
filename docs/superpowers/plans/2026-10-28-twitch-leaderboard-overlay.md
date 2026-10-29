# Twitch Leaderboard Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SaaS-ready Twitch leaderboard overlay: licensed streamer dashboard on Vercel, EventSub ingestion into Supabase, realtime OBS overlay with offline fallback, and chat-mod controls.

**Architecture:** Next.js App Router hosts the dashboard, overlay page, OAuth routes, and a Vercel Edge webhook receiver. Supabase Postgres stores the immutable points ledger, per-window aggregates, and per-streamer config; Supabase Realtime broadcasts leaderboard + settings payloads to one or more OBS browser sources. Pure business logic (points, EventSub parsing, licensing, debounce, settings merge) lives in `src/lib` and is unit-tested with Vitest; network/database adapters stay thin.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest + Testing Library (jsdom), Twitch EventSub + OAuth, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-28-twitch-leaderboard-overlay-design.md` (this plan is the approved blueprint from the conversation; the design doc will be written alongside Task 1 if not yet present).

## Global Constraints

- Node.js >= 20 (verified 24.21.0), npm >= 10 (verified 12.0.2).
- TypeScript `strict: true`; no `any` in exported library signatures.
- App Router only; no Pages Router.
- Money is stored as integer **cents**; points are non-negative integers.
- One license key binds to exactly one `twitch_user_id`, permanently, on first dashboard login.
- OBS URL token generated with `crypto.randomBytes(32).toString('base64url')`.
- EventSub deliveries are idempotent on `(streamer_id, twitch_event_id)`.
- Gifted subs credit the **gifter only**; `channel.subscription.message` with `is_gift === true` is ignored.
- Aggregate writes are throttled to at most one flush per streamer per 2000 ms.
- Overlay never blanks: on Realtime/DB failure it renders the last payload from `localStorage`.
- Regenerating the OBS token invalidates the previous URL immediately.
- RLS enabled on every table; streamer rows readable/writable only by their owner.
- Never log access tokens, license keys, or OBS tokens.
- Deploy target is Vercel + Supabase only; no self-hosted services.

## Review Focus

1. **Twitch retries / duplicate deliveries** — a retried EventSub message must update nothing a second time. Tested in Task 4.
2. **Community gift + recipient resub double count** — one bundle event plus N `channel.subscription.message` events must produce points for the gifter only, once. Tested in Task 4.
3. **Anonymous gifter identity leak** — masked gifters must never surface their real username in the broadcast payload. Tested in Task 4.
4. **Database outage** — overlay must keep rendering cached data instead of going blank. Tested in Task 10.
5. **Token regeneration** — an old OBS URL must stop receiving updates immediately after regeneration. Tested in Task 8.

---

### Task 1: Project scaffold, health route, and test runner

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `.gitignore`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/app/api/health/route.ts`
- Create: `vitest.config.ts`, `src/test/setup.ts`
- Create: `docs/superpowers/specs/2026-10-28-twitch-leaderboard-overlay-design.md`
- Test: `src/app/api/health/route.test.ts`

**Interfaces:**
- Produces: `GET /api/health` → `{ status: 'ok' }`; `npm run dev`, `npm run build`, `npm test` scripts.

- [ ] **Step 1: Scaffold Next.js with TypeScript + Tailwind**

Run: `npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --import-alias "@/*" --no-turbopack --yes`
Expected: project files created in the current directory.

- [ ] **Step 2: Add Vitest + Testing Library**

Run: `npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom`
Add scripts to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.
Create `vitest.config.ts` with `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`, and the `@/` alias.
Create `src/test/setup.ts` importing `@testing-library/jest-dom/vitest`.

- [ ] **Step 3: Write the failing health test**

```ts
import { describe, it, expect } from 'vitest'
import { GET } from './route'

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- src/app/api/health/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 5: Implement the health route**

Create `src/app/api/health/route.ts` exporting `export async function GET()` returning `Response.json({ status: 'ok' })`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/app/api/health/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Add `.env.example` and the design doc**

`.env.example` lists: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_WEBHOOK_SECRET`, `TWITCH_CHAT_BOT_TOKEN`, `TOKEN_ENCRYPTION_KEY` (32-byte base64), `NEXT_PUBLIC_APP_URL`.
Write the approved blueprint into the spec file.

- [ ] **Step 8: Verify build and commit**

Run: `npm run build`
Expected: successful production build.
```bash
git init
git add .
git commit -m "chore: scaffold Next.js app with health route and vitest"
```

---

### Task 2: Supabase schema, RLS, and generated types

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
- Create: `src/lib/types.ts`
- Test: `supabase/migrations/0001_init.sql` validated by manual SQL run (documented); pure type file checked by `tsc`.

**Interfaces:**
- Produces: `createBrowserClient()`, `createServerClient()` (reads cookies), `createAdminClient()` (service role, server-only).
- Produces types: `Streamer`, `License`, `OverlaySession`, `PointEvent`, `LeaderboardRow`, `OverlaySettings`.

- [ ] **Step 1: Write the migration**

Create `0001_init.sql` with the six tables from the blueprint:
`streamers`, `licenses`, `overlay_sessions`, `point_events`, `stream_windows`, `leaderboard_aggregates`.
Include:
- `create extension if not exists pgcrypto;`
- `point_events unique (streamer_id, twitch_event_id)`
- indexes on `(streamer_id, created_at)` and `(streamer_id, window_type)`
- `alter table ... enable row level security;` on all six
- policy `streamers_self` for `select/update` where `id = auth.uid()`
- policy `owns_*` for child tables via `streamer_id in (select id from streamers where id = auth.uid())`
- `insert into storage` not needed
- `grant` service role bypass is automatic
- helper `flush_streamer_aggregates(p_streamer_id uuid)` SQL function (documented) that upserts `leaderboard_aggregates` from `point_events` since `stream_windows.started_at`, guarded by `pg_advisory_xact_lock(hashtext(p_streamer_id::text))`

- [ ] **Step 2: Create Supabase clients**

`client.ts`: browser client from `NEXT_PUBLIC_*`.
`server.ts`: server client using `@supabase/ssr` cookie adapter (Next `cookies()`).
`admin.ts`: service-role client with `import 'server-only'`; throws if `SUPABASE_SERVICE_ROLE_KEY` missing.

- [ ] **Step 3: Define shared types**

`src/lib/types.ts` exports the six interfaces mirroring the columns, with `OverlaySettings` nested as:
```ts
type OverlaySettings = {
  pointConfig: { tip: number; bit: number; sub: number; gift: number; raid: number }
  tipThresholdCents: number
  anonymousMaskName: string | null
  display: { ranks: boolean; medals: boolean; rankNumbers: boolean; bars: boolean; amounts: boolean }
  hiddenAccounts: string[]
  layout: { width: number; padding: number; borderRadius: number }
  visuals: { opacity: number; fontSize: number }
  theme: { preset: 'midnight' | 'ember' | 'mint' | 'grape' | 'paper'; overrides: Record<string, string> }
  rotation: { enabled: boolean; intervalMs: number }
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add supabase src/lib/types.ts src/lib/supabase
git commit -m "feat: add supabase schema, rls, clients, and shared types"
```

---

### Task 3: Point calculation engine

**Files:**
- Create: `src/lib/points.ts`
- Test: `src/lib/points.test.ts`

**Interfaces:**
- Produces:
  - `computePoints(eventType: EventType, amountCents: number, config: PointConfig): number`
  - `shouldCredit(eventType: EventType, amountCents: number, thresholdCents: number): boolean`
  - `type EventType = 'tip' | 'bit' | 'sub' | 'gift' | 'raid'`
- `amountCents` semantics: tip → cents; bit → bits; sub/gift/raid → count of subs/gifts/raiders.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { computePoints, shouldCredit } from './points'

const cfg = { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 }

describe('computePoints', () => {
  it('multiplies tip cents by per-cent rate', () => expect(computePoints('tip', 1000, cfg)).toBe(1000))
  it('multiplies bits by per-bit rate', () => expect(computePoints('bit', 100, cfg)).toBe(100))
  it('credits gift bundles by count', () => expect(computePoints('gift', 5, cfg)).toBe(1500))
  it('credits raids by raider count', () => expect(computePoints('raid', 20, cfg)).toBe(1000))
  it('never returns negative points', () => expect(computePoints('tip', -50, cfg)).toBe(0))
})

describe('shouldCredit', () => {
  it('ignores tips below the threshold', () => expect(shouldCredit('tip', 99, 100)).toBe(false))
  it('credits tips at the threshold', () => expect(shouldCredit('tip', 100, 100)).toBe(true))
  it('ignores zero tips when a threshold is set', () => expect(shouldCredit('tip', 0, 100)).toBe(false))
  it('always credits non-tip events', () => expect(shouldCredit('bit', 0, 100)).toBe(true))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/points.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `points.ts`**

Implement with `Math.max(0, Math.floor(...))`; `shouldCredit` ignores only `tip` events below threshold. Export `PointConfig`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/points.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/points.ts src/lib/points.test.ts
git commit -m "feat: add point calculation and tip threshold logic"
```

---

### Task 4: EventSub signature verification and event parsing

**Files:**
- Create: `src/lib/eventsub.ts`
- Test: `src/lib/eventsub.test.ts`

**Interfaces:**
- Produces:
  - `verifyTwitchSignature(headers: Headers, rawBody: string, secret: string, now?: number): boolean`
  - `parseEvent(subscriptionType: string, event: Record<string, unknown>): ParsedEvent`
  - `type ParsedEvent = { kind: 'credit'; eventType: EventType; userId: string; username: string; amount: number; isAnonymous: boolean } | { kind: 'ignore'; reason: string }`
- Gifted logic:
  - `channel.subscription.gift` → `credit` gifter (`user_id`), `eventType: 'gift'`, `amount: event.total`
  - `channel.subscription.message` with `is_gift === true` → `ignore` (recipient of a gift)
  - `channel.subscription.message` otherwise → `credit` subscriber, `'sub'`, amount 1
  - `channel.subscription` → `credit`, `'sub'`, amount 1
  - `channel.cheer` → `credit`, `'bit'`, `amount: event.bits`
  - `channel.raid` → `credit`, `'raid'`, `amount: event.viewers`, userId `from_broadcaster_user_id`
  - unknown → `ignore`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { computeHmac, verifyTwitchSignature, parseEvent } from './eventsub'

const secret = 's3cret'

describe('verifyTwitchSignature', () => {
  it('accepts a valid signature', () => {
    const body = '{"a":1}'
    const id = 'msg-1', ts = String(Math.floor(Date.now() / 1000))
    const sig = computeHmac(id + ts + body, secret)
    const headers = new Headers({ 'Twitch-Eventsub-Message-Id': id, 'Twitch-Eventsub-Message-Timestamp': ts, 'Twitch-Eventsub-Signature': 'sha256=' + sig })
    expect(verifyTwitchSignature(headers, body, secret)).toBe(true)
  })
  it('rejects a tampered body', () => {
    const body = '{"a":1}', ts = String(Math.floor(Date.now() / 1000))
    const sig = computeHmac('msg-1' + ts + body, secret)
    const headers = new Headers({ 'Twitch-Eventsub-Message-Id': 'msg-1', 'Twitch-Eventsub-Message-Timestamp': ts, 'Twitch-Eventsub-Signature': 'sha256=' + sig })
    expect(verifyTwitchSignature(headers, '{"a":2}', secret)).toBe(false)
  })
  it('rejects a stale timestamp', () => {
    const body = '{}', ts = String(Math.floor(Date.now() / 1000) - 600)
    const sig = computeHmac('m' + ts + body, secret)
    const headers = new Headers({ 'Twitch-Eventsub-Message-Id': 'm', 'Twitch-Eventsub-Message-Timestamp': ts, 'Twitch-Eventsub-Signature': 'sha256=' + sig })
    expect(verifyTwitchSignature(headers, body, secret)).toBe(false)
  })
})

describe('parseEvent gifted subs', () => {
  it('credits the gifter, never the recipient', () => {
    const p = parseEvent('channel.subscription.gift', { user_id: 'gifter-1', user_login: 'gifter', user_name: 'Gifter', total: 5, is_anonymous: false })
    expect(p).toMatchObject({ kind: 'credit', eventType: 'gift', userId: 'gifter-1', amount: 5 })
  })
  it('ignores the recipient subscription.message of a gift', () => {
    const p = parseEvent('channel.subscription.message', { user_id: 'recipient-1', is_gift: true, tier: '1000' })
    expect(p.kind).toBe('ignore')
  })
  it('credits a normal resub', () => {
    const p = parseEvent('channel.subscription.message', { user_id: 'sub-1', user_login: 's', user_name: 'S', is_gift: false })
    expect(p).toMatchObject({ kind: 'credit', eventType: 'sub', userId: 'sub-1', amount: 1 })
  })
  it('credits cheer bits', () => {
    const p = parseEvent('channel.cheer', { user_id: 'u1', user_login: 'u', user_name: 'U', bits: 500, is_anonymous: false })
    expect(p).toMatchObject({ kind: 'credit', eventType: 'bit', amount: 500 })
  })
  it('credits the raider from broadcaster fields', () => {
    const p = parseEvent('channel.raid', { from_broadcaster_user_id: 'r1', from_broadcaster_user_login: 'r', from_broadcaster_user_name: 'R', viewers: 42 })
    expect(p).toMatchObject({ kind: 'credit', eventType: 'raid', userId: 'r1', amount: 42 })
  })
  it('marks anonymous events', () => {
    const p = parseEvent('channel.cheer', { user_id: 'u1', user_login: 'u', user_name: 'U', bits: 10, is_anonymous: true })
    expect(p).toMatchObject({ kind: 'credit', isAnonymous: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/eventsub.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `eventsub.ts`**

Use Web Crypto HMAC-SHA256 via a `computeHmac` helper (testable) and constant-time comparison. `verifyTwitchSignature` rejects when timestamp skew > 300 s, signature missing, or HMAC mismatch. `parseEvent` follows the mapping above; coerce `event.total`/`bits`/`viewers` with `Number(...) || 0`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/eventsub.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/eventsub.ts src/lib/eventsub.test.ts
git commit -m "feat: add eventsub signature verification and safe event parsing"
```

---

### Task 5: Write debouncing / batching

**Files:**
- Create: `src/lib/debounce.ts`
- Test: `src/lib/debounce.test.ts`

**Interfaces:**
- Produces:
  - `class DebounceBuffer<T> { push(item: T, now: number): void; drain(now: number): T[]; }`
  - `shouldFlush(lastFlushAt: number, now: number, intervalMs?: number): boolean`
- Behavior: per-instance; `drain` returns pending items only when `now - lastFlushAt >= 2000`, then empties and updates `lastFlushAt`; otherwise returns `[]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { DebounceBuffer, shouldFlush } from './debounce'

describe('shouldFlush', () => {
  it('allows the first flush', () => expect(shouldFlush(0, 500)).toBe(true))
  it('blocks within 2s', () => expect(shouldFlush(1000, 2500)).toBe(false))
  it('allows at 2s', () => expect(shouldFlush(1000, 3000)).toBe(true))
})

describe('DebounceBuffer', () => {
  it('batches events and flushes at most once per 2s', () => {
    const b = new DebounceBuffer<number>()
    b.push(1, 0); b.push(2, 1000)
    expect(b.drain(1500)).toEqual([])
    expect(b.drain(2000)).toEqual([1, 2])
    expect(b.drain(2500)).toEqual([])
    b.push(3, 2600)
    expect(b.drain(4000)).toEqual([3])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/debounce.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `debounce.ts`**

Default interval `2000`; `lastFlushAt` initialized to `-Infinity` so the first drain flushes immediately.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/debounce.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debounce.ts src/lib/debounce.test.ts
git commit -m "feat: add per-stream write debouncing"
```

---

### Task 6: EventSub webhook route

**Files:**
- Create: `src/app/api/webhooks/twitch/route.ts`
- Create: `src/lib/events.ts` (route-free orchestration: `handleEvent`)
- Test: `src/lib/events.test.ts`

**Interfaces:**
- Consumes: `verifyTwitchSignature`, `parseEvent`, `computePoints`, `shouldCredit`, `DebounceBuffer`, `createAdminClient`.
- Produces: `POST /api/webhooks/twitch`; `handleEvent(deps, input)` where `deps` is an injected object:
  ```ts
  type EventDeps = {
    findStreamer: (twitchUserId: string) => Promise<Streamer | null>
    insertPointEvent: (row: PointEventInput) => Promise<'inserted' | 'duplicate'>
    flushAggregates: (streamerId: string) => Promise<void>
    broadcast: (streamerId: string, payload: unknown) => Promise<void>
    now?: () => number
  }
  ```
  This keeps the orchestration testable without a live database.

- [ ] **Step 1: Write the failing orchestration tests**

```ts
import { describe, it, expect, vi } from 'vitest'
import { handleEvent } from './events'

const streamer = { id: 's1', twitchUserId: 'owner', anonymousMaskName: 'Mystery Supporter', tipThresholdCents: 100, pointConfig: { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 } }

function deps(overrides = {}) {
  return {
    findStreamer: vi.fn().mockResolvedValue(streamer),
    insertPointEvent: vi.fn().mockResolvedValue('inserted'),
    flushAggregates: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn().mockResolvedValue(undefined),
    now: () => 0,
    ...overrides,
  }
}

describe('handleEvent', () => {
  it('credits the gifter for a gift bundle', async () => {
    const d = deps()
    const out = await handleEvent(d, { subscriptionType: 'channel.subscription.gift', event: { user_id: 'gifter', user_login: 'g', user_name: 'G', total: 5, is_anonymous: false }, messageId: 'm1', broadcasterUserId: 'owner' })
    expect(out).toBe('processed')
    expect(d.insertPointEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'gift', creditedUserId: 'gifter', pointsAwarded: 1500 }))
  })
  it('ignores recipient subscription messages for gifts', async () => {
    const d = deps()
    const out = await handleEvent(d, { subscriptionType: 'channel.subscription.message', event: { user_id: 'recipient', is_gift: true }, messageId: 'm2', broadcasterUserId: 'owner' })
    expect(out).toBe('ignored')
    expect(d.insertPointEvent).not.toHaveBeenCalled()
  })
  it('drops duplicate deliveries', async () => {
    const d = deps({ insertPointEvent: vi.fn().mockResolvedValue('duplicate') })
    const out = await handleEvent(d, { subscriptionType: 'channel.cheer', event: { user_id: 'u', bits: 10 }, messageId: 'm3', broadcasterUserId: 'owner' })
    expect(out).toBe('duplicate')
    expect(d.broadcast).not.toHaveBeenCalled()
  })
  it('applies the anonymous mask to the credited username', async () => {
    const d = deps()
    await handleEvent(d, { subscriptionType: 'channel.cheer', event: { user_id: 'u', user_login: 'real', user_name: 'Real', bits: 10, is_anonymous: true }, messageId: 'm4', broadcasterUserId: 'owner' })
    expect(d.insertPointEvent).toHaveBeenCalledWith(expect.objectContaining({ creditedUsername: 'Mystery Supporter' }))
  })
  it('ignores tiny tips below the threshold', async () => {
    const d = deps()
    const out = await handleEvent(d, { subscriptionType: 'tip', event: { user_id: 'u', user_login: 'u', user_name: 'U', amount_cents: 50 }, messageId: 'm5', broadcasterUserId: 'owner' })
    expect(out).toBe('ignored')
  })
  it('returns unknown-streamer when the broadcaster is unregistered', async () => {
    const d = deps({ findStreamer: vi.fn().mockResolvedValue(null) })
    const out = await handleEvent(d, { subscriptionType: 'channel.cheer', event: { user_id: 'u', bits: 10 }, messageId: 'm6', broadcasterUserId: 'nobody' })
    expect(out).toBe('unknown-streamer')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/events.ts`**

`handleEvent` resolves the streamer by `broadcasterUserId`, parses the event, applies `shouldCredit` (threshold), computes points, builds the ledger row, inserts it, and on `'inserted'` calls `flushAggregates` then `broadcast` with `{ type: 'leaderboard.update', streamerId }`. On `'duplicate'` it returns without broadcasting.

- [ ] **Step 4: Implement the route**

`route.ts` (Edge runtime export):
- On `webhook_callback_verification` → return `event.challenge` as text.
- On `revocation` → return 204.
- Otherwise verify signature, call `handleEvent` with real Supabase deps, return 200 (or 403/401 on bad signature).
- Broadcast uses `supabase.channel('overlay:' + streamerId).send({ type: 'broadcast', event: 'leaderboard.update', payload })`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- src/lib/events.test.ts; npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/events.ts src/lib/events.test.ts src/app/api/webhooks/twitch/route.ts
git commit -m "feat: add testable eventsub webhook orchestration and route"
```

---

### Task 7: Licensing — binding, token generation, regeneration

**Files:**
- Create: `src/lib/licensing.ts`
- Test: `src/lib/licensing.test.ts`
- API: `src/app/api/license/validate/route.ts` (POST)

**Interfaces:**
- Produces:
  - `canBindLicense(license: { twitchUserId: string | null }, twitchUserId: string): boolean`
  - `generateOpaqueToken(bytes?: number): string`
  - `tokenIsValid(session: { token: string; isActive: boolean }, presented: string): boolean`
  - `encryptToken(plain: string, keyBase64: string): string`, `decryptToken(cipher: string, keyBase64: string): string` (AES-256-GCM)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { canBindLicense, generateOpaqueToken, tokenIsValid, encryptToken, decryptToken } from './licensing'

describe('canBindLicense', () => {
  it('binds an unbound license', () => expect(canBindLicense({ twitchUserId: null }, 'tw1')).toBe(true))
  it('allows the same owner to log in again', () => expect(canBindLicense({ twitchUserId: 'tw1' }, 'tw1')).toBe(true))
  it('rejects a different owner (no link sharing)', () => expect(canBindLicense({ twitchUserId: 'tw1' }, 'tw2')).toBe(false))
})

describe('generateOpaqueToken', () => {
  it('is url-safe and long enough', () => {
    const t = generateOpaqueToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(40)
  })
  it('is unique', () => expect(generateOpaqueToken()).not.toBe(generateOpaqueToken()))
})

describe('tokenIsValid', () => {
  it('accepts the active token', () => expect(tokenIsValid({ token: 'abc', isActive: true }, 'abc')).toBe(true))
  it('rejects a regenerated-away token', () => expect(tokenIsValid({ token: 'new', isActive: true }, 'old')).toBe(false))
  it('rejects inactive sessions', () => expect(tokenIsValid({ token: 'abc', isActive: false }, 'abc')).toBe(false))
})

describe('encryptToken', () => {
  it('round-trips', () => {
    const key = Buffer.alloc(32, 7).toString('base64')
    expect(decryptToken(encryptToken('secret', key), key)).toBe('secret')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/licensing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `licensing.ts`**

`generateOpaqueToken` uses `crypto.randomBytes(bytes ?? 32).toString('base64url')`. AES-256-GCM with a random 12-byte IV stored as `iv.tag.cipher` base64url.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/licensing.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the validate route**

`POST /api/license/validate` with `{ licenseKey }` authenticated as the current streamer: loads the license; if unbound, binds `twitch_user_id` + `bound_at`; if bound to a different ID, returns 409; on success returns `{ ok: true, boundTwitchUserId }`. Never echo the key back.

- [ ] **Step 6: Commit**

```bash
git add src/lib/licensing.ts src/lib/licensing.test.ts src/app/api/license/validate/route.ts
git commit -m "feat: add license binding, opaque tokens, and token encryption"
```

---

### Task 8: OBS token regeneration endpoint + old-token invalidation

**Files:**
- Create: `src/app/api/overlay/regenerate/route.ts`
- Modify: `src/lib/licensing.ts` (add `regenerateOverlayToken`)
- Test: `src/lib/licensing.test.ts` (append regeneration test)

**Interfaces:**
- Produces: `regenerateOverlayToken(current: { token: string; isActive: boolean }, newToken: string): { token: string; isActive: boolean; previousToken: string }` — returns the new session shape and the token to revoke.

- [ ] **Step 1: Write the failing test**

```ts
import { regenerateOverlayToken } from './licensing'
it('regenerates to a new token and revokes the old one', () => {
  const r = regenerateOverlayToken({ token: 'old', isActive: true }, 'new')
  expect(r.token).toBe('new')
  expect(r.previousToken).toBe('old')
  expect(tokenIsValid({ token: r.token, isActive: r.isActive }, 'old')).toBe(false)
  expect(tokenIsValid({ token: r.token, isActive: r.isActive }, 'new')).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/licensing.test.ts`
Expected: FAIL — `regenerateOverlayToken` not exported.

- [ ] **Step 3: Implement and wire the route**

Implement `regenerateOverlayToken`. The route authenticates the streamer, generates a fresh token, updates `streamers.obs_token` + `obs_token_regenerated_at`, and returns the new URL `new URL('/overlay/' + token, NEXT_PUBLIC_APP_URL).toString()`. Overlays using the old token fail `tokenIsValid` on their next re-subscribe/fetch.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/lib/licensing.test.ts`
Expected: PASS.
```bash
git add src/lib/licensing.ts src/lib/licensing.test.ts src/app/api/overlay/regenerate/route.ts
git commit -m "feat: add obs token regeneration and old-token invalidation"
```

---

### Task 9: Overlay settings defaults, merge, theme, and rotation

**Files:**
- Create: `src/lib/settings.ts`
- Test: `src/lib/settings.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_SETTINGS: OverlaySettings`
  - `mergeSettings(partial: DeepPartial<OverlaySettings>): OverlaySettings`
  - `THEMES: Record<ThemePreset, { background: string; text: string; accent: string; bar: string }>`
  - `cssVars(settings: OverlaySettings): Record<string, string>`
  - `nextRotationWindow(current: WindowType, order?: WindowType[]): WindowType`
  - `type WindowType = 'this_stream' | '7d' | '30d' | 'alltime'`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings, THEMES, cssVars, nextRotationWindow } from './settings'

describe('mergeSettings', () => {
  it('preserves defaults for omitted keys', () => {
    const s = mergeSettings({ display: { medals: false } })
    expect(s.display.medals).toBe(false)
    expect(s.display.bars).toBe(DEFAULT_SETTINGS.display.bars)
  })
  it('clamps opacity into 0..100', () => {
    expect(mergeSettings({ visuals: { opacity: 150 } }).visuals.opacity).toBe(100)
    expect(mergeSettings({ visuals: { opacity: -5 } }).visuals.opacity).toBe(0)
  })
})

describe('themes', () => {
  it('resolves a preset color', () => expect(THEMES.midnight.background).toMatch(/^#/))
  it('lets overrides win', () => {
    const vars = cssVars({ ...DEFAULT_SETTINGS, theme: { preset: 'midnight', overrides: { '--lb-accent': '#ff0000' } } })
    expect(vars['--lb-accent']).toBe('#ff0000')
  })
})

describe('nextRotationWindow', () => {
  it('cycles in order and wraps', () => {
    expect(nextRotationWindow('this_stream')).toBe('7d')
    expect(nextRotationWindow('alltime')).toBe('this_stream')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `settings.ts`**

Deep-merge with `structuredClone` defaults; clamp numeric ranges (opacity 0–100, fontSize 8–72, width 200–800, padding 0–48, borderRadius 0–999, intervalMs 3000–300000). `cssVars` maps settings to `--lb-*` custom properties and merges theme overrides last.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/lib/settings.test.ts`
Expected: PASS.
```bash
git add src/lib/settings.ts src/lib/settings.test.ts
git commit -m "feat: add overlay settings merge, themes, css vars, and rotation"
```

---

### Task 10: Overlay page, realtime client, and offline fallback

**Files:**
- Create: `src/app/overlay/[token]/page.tsx` (server component: validates token, loads streamer + aggregates)
- Create: `src/components/overlay/OverlayClient.tsx` (client component)
- Create: `src/components/overlay/Leaderboard.tsx`
- Create: `src/hooks/useOverlayRealtime.ts`
- Create: `src/hooks/useLocalCache.ts`
- Test: `src/hooks/useLocalCache.test.ts`, `src/components/overlay/Leaderboard.test.tsx`

**Interfaces:**
- Consumes: `OverlaySettings`, `cssVars`, `nextRotationWindow`, `LeaderboardRow`.
- Produces:
  - `useOverlayRealtime(token: string, initial: OverlayState): { state: OverlayState; connected: boolean }`
  - `useLocalCache<T>(key: string, fallback: T): [T, (v: T) => void]`
  - `<Leaderboard rows={LeaderboardRow[]} settings={OverlaySettings} window: WindowType />`

- [ ] **Step 1: Write the failing tests**

```ts
// src/hooks/useLocalCache.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { readCache, writeCache } from './useLocalCache'

beforeEach(() => localStorage.clear())

describe('local cache', () => {
  it('writes and reads a payload', () => {
    writeCache('overlay:abc', { points: 42 })
    expect(readCache('overlay:abc', null)).toEqual({ points: 42 })
  })
  it('returns the fallback when the cache is empty or corrupt', () => {
    expect(readCache('missing', [])).toEqual([])
    localStorage.setItem('bad', '{not json')
    expect(readCache('bad', 'fallback')).toBe('fallback')
  })
})
```

```tsx
// src/components/overlay/Leaderboard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Leaderboard } from './Leaderboard'
import { DEFAULT_SETTINGS } from '@/lib/settings'

describe('Leaderboard', () => {
  it('hides ranks when the toggle is off', () => {
    render(<Leaderboard rows={[{ userId: 'u', username: 'Alice', points: 10 }]} settings={{ ...DEFAULT_SETTINGS, display: { ...DEFAULT_SETTINGS.display, rankNumbers: false, medals: false } }} window="this_stream" />)
    expect(screen.queryByText('#1')).toBeNull()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
  it('hides hidden accounts', () => {
    render(<Leaderboard rows={[{ userId: 'u', username: 'Nightbot', points: 99 }]} settings={{ ...DEFAULT_SETTINGS, hiddenAccounts: ['nightbot'] }} window="this_stream" />)
    expect(screen.queryByText('Nightbot')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/hooks/useLocalCache.test.ts src/components/overlay/Leaderboard.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement cache + leaderboard**

`readCache`/`writeCache` guard `JSON.parse` in try/catch. `Leaderboard` filters `hiddenAccounts` case-insensitively, slices to the rank-25 cap, conditionally renders medals/rank numbers/bars/amounts, and writes `data-*` attributes used by CSS.

- [ ] **Step 4: Implement realtime hook and overlay page**

`useOverlayRealtime` subscribes to `supabase.channel('overlay:' + token)` for `broadcast` event `leaderboard.update` and `postgres_changes` on `leaderboard_aggregates`; merges payload into state; on `SUBSCRIBED` re-fetches `/api/overlay/[token]/data`; on error sets `connected=false`. `useOverlayRealtime` also calls `writeCache` on every accepted payload so Task 10's fallback has data.

`OverlayClient` reads the cache first (`useLocalCache`), then swaps in live data when connected, and renders `<Leaderboard />` inside a wrapper styled from `cssVars(DEFAULT_SETTINGS)`. Rotation uses `setInterval` + `nextRotationWindow` with CSS opacity transitions.

- [ ] **Step 5: Implement the data route used for refresh**

Create `src/app/api/overlay/[token]/data/route.ts` (GET): validates the token via `tokenIsValid`, returns `{ streamerId, settings, rows, window }`, 404 on invalid token.

- [ ] **Step 6: Add an offline-fallback test**

```tsx
it('renders cached rows when the live state is empty', () => {
  localStorage.setItem('overlay:tok', JSON.stringify({ rows: [{ userId: 'u', username: 'Cached', points: 7 }] }))
  render(<OverlayClient token="tok" initial={{ rows: [], settings: DEFAULT_SETTINGS, window: 'this_stream' }} />)
  expect(screen.getByText('Cached')).toBeInTheDocument()
})
```

- [ ] **Step 7: Run tests, typecheck, commit**

Run: `npm test -- src/hooks/useLocalCache.test.ts src/components/overlay/Leaderboard.test.tsx; npx tsc --noEmit`
Expected: PASS, no errors.
```bash
git add src/app/overlay src/app/api/overlay src/components/overlay src/hooks
git commit -m "feat: add realtime overlay with local cache fallback"
```

---

### Task 11: Dashboard settings API and UI

**Files:**
- Create: `src/app/dashboard/page.tsx`, `src/app/dashboard/settings/page.tsx`
- Create: `src/app/api/settings/route.ts` (GET/PUT)
- Create: `src/components/dashboard/SettingsForm.tsx`
- Create: `src/components/dashboard/controls/*.tsx` (toggle, slider, color field)
- Test: `src/lib/settings.test.ts` (already covers merge) + `src/components/dashboard/SettingsForm.test.tsx`

**Interfaces:**
- Consumes: `mergeSettings`, `DEFAULT_SETTINGS`, `OverlaySettings`.
- Produces: `PUT /api/settings` accepts `DeepPartial<OverlaySettings>`, validates, merges, persists to `streamers`, returns the merged settings.

- [ ] **Step 1: Write the failing form test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsForm } from './SettingsForm'
import { DEFAULT_SETTINGS } from '@/lib/settings'

it('turns the medals toggle off and reports the change', () => {
  const onChange = vi.fn()
  render(<SettingsForm initial={DEFAULT_SETTINGS} onChange={onChange} />)
  fireEvent.click(screen.getByLabelText(/medals/i))
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ display: expect.objectContaining({ medals: false }) }))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/components/dashboard/SettingsForm.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the form and controls**

Build the full settings surface: display toggles (ranks 1–25 cap, medals, rank numbers, progress bars, amounts), hidden-account text list, five point inputs, tip threshold, layout sliders (width, padding, border radius), visuals (opacity, font size), theme preset dropdown + five HEX overrides, rotation toggle + interval. Each change calls `onChange(mergeSettings(next))`.

- [ ] **Step 4: Implement the API route and pages**

`GET /api/settings` returns the streamer's settings; `PUT /api/settings` validates ownership (RLS + `auth.uid()`), merges, persists via admin client, and broadcasts `{ type: 'settings.update', settings }` on `overlay:{streamerId}`. Dashboard pages gate on an authenticated session and show the license-bound state.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/components/dashboard/SettingsForm.test.tsx; npx tsc --noEmit`
Expected: PASS.
```bash
git add src/app/dashboard src/app/api/settings src/components/dashboard
git commit -m "feat: add dashboard settings api and no-code settings ui"
```

---

### Task 12: Twitch OAuth login

**Files:**
- Create: `src/app/api/auth/twitch/route.ts` (redirect with state)
- Create: `src/app/api/auth/twitch/callback/route.ts` (exchange code, upsert streamer)
- Create: `src/lib/twitch.ts`
- Test: `src/lib/twitch.test.ts`

**Interfaces:**
- Produces: `buildAuthorizeUrl({ clientId, redirectUri, state, scopes? }): string`, `exchangeCode({ code, clientId, clientSecret, redirectUri }): Promise<{ accessToken: string; refreshToken?: string; userId?: string }>`, `verifyOAuthState(stored: string, returned: string): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { buildAuthorizeUrl, verifyOAuthState } from './twitch'
it('builds a twitch authorize url with scopes and state', () => {
  const url = new URL(buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'http://localhost/cb', state: 'xyz' }))
  expect(url.host).toBe('id.twitch.tv')
  expect(url.searchParams.get('client_id')).toBe('cid')
  expect(url.searchParams.get('state')).toBe('xyz')
  expect(url.searchParams.get('scope')).toContain('moderator:read:chatters')
})
it('rejects mismatched oauth state', () => {
  expect(verifyOAuthState('a', 'a')).toBe(true)
  expect(verifyOAuthState('a', 'b')).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**, implement, and **run to verify it passes**

Run: `npm test -- src/lib/twitch.test.ts` (fail → implement → pass).

- [ ] **Step 3: Implement the routes**

`/api/auth/twitch` sets an httpOnly `twitch_oauth_state` cookie (random) and redirects to the authorize URL. The callback verifies state, exchanges the code, fetches the user via `https://api.twitch.tv/helix/users`, encrypts the token with `encryptToken`, and upserts the `streamers` row keyed by `twitch_user_id` (without binding a license yet). Redirects to `/dashboard`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth src/lib/twitch.ts src/lib/twitch.test.ts
git commit -m "feat: add twitch oauth login and callback"
```

---

### Task 13: Twitch chat bot mod commands

**Files:**
- Create: `src/lib/chatCommands.ts`
- Create: `src/app/api/overlay/[streamerId]/command/route.ts`
- Create: `scripts/chat-bot.ts` (long-running bot process; not on Vercel)
- Test: `src/lib/chatCommands.test.ts`

**Interfaces:**
- Produces: `parseChatCommand(text: string): { command: 'refresh' | 'clear-stream' } | null`, `canModerate(badges: Record<string, string>, userId: string, broadcasterId: string): boolean`, `ApplyCommand(deps, input): Promise<'applied' | 'rejected'>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { parseChatCommand, canModerate } from './chatCommands'
it('parses refresh and clear-stream', () => {
  expect(parseChatCommand('!leaderboard refresh')).toEqual({ command: 'refresh' })
  expect(parseChatCommand('!leaderboard clear stream')).toEqual({ command: 'clear-stream' })
  expect(parseChatCommand('hello')).toBeNull()
})
it('only lets the broadcaster and mods through', () => {
  expect(canModerate({ broadcaster: '1' }, 'u', 'b')).toBe(true)
  expect(canModerate({ moderator: '1' }, 'u', 'b')).toBe(true)
  expect(canModerate({}, 'u', 'b')).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**, implement, and **run to verify it passes**

Run: `npm test -- src/lib/chatCommands.test.ts`.

- [ ] **Step 3: Implement the command route and bot**

The route validates the caller is broadcaster/mod, then for `refresh` broadcasts `{ type: 'command.refresh' }`; for `clear-stream` zeroes `leaderboard_aggregates` for `window_type='this_stream'` and broadcasts `{ type: 'command.clear-stream' }`. The bot connects with `tmi.js` using `TWITCH_CHAT_BOT_TOKEN`, watches for `!leaderboard` messages, and calls the route.

- [ ] **Step 4: Commit**

```bash
git add src/lib/chatCommands.ts src/lib/chatCommands.test.ts src/app/api/overlay src/scripts
git commit -m "feat: add twitch chat mod commands"
```

---

### Task 14: Environment setup docs, RLS verification, and deploy checklist

**Files:**
- Create: `README.md`
- Create: `docs/VERCEL_SETUP.md`

**Interfaces:**
- Produces: reproducible setup instructions and a deploy checklist.

- [ ] **Step 1: Write setup docs**

Document: create Supabase project, run `0001_init.sql`, set env vars, create Twitch app + EventSub subscription to `https://<domain>/api/webhooks/twitch` with the `channel.subscription.gift`, `channel.subscription.message`, `channel.subscription`, `channel.cheer`, `channel.raid` scopes, and set `TWITCH_WEBHOOK_SECRET`.

- [ ] **Step 2: Verify RLS manually**

Run two SQL inserts as two different `auth.uid()` sessions; confirm cross-streamer reads return zero rows.

- [ ] **Step 3: Run the full suite and build**

Run: `npm test; npx tsc --noEmit; npm run build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/VERCEL_SETUP.md
git commit -m "docs: add supabase, twitch, and vercel setup guide"
```

---

## Execution Dependencies

- Task 2 must precede Tasks 6–14 (types/clients).
- Tasks 3–5 must precede Task 6 (they are consumed by `events.ts`).
- Task 9 must precede Tasks 10–11 (settings shape).
- Tasks 7–8 must precede Task 10 (token validation).
- Task 12 must precede Task 11's authenticated dashboard.
- Task 13 depends on Task 10's overlay channels.

## Verification Commands

- Unit: `npm test`
- Types: `npx tsc --noEmit`
- Build: `npm run build`
- Dev: `npm run dev` → `/api/health`, `/overlay/<token>`, `/dashboard`

## Credentials Required Before Live Verification

Supabase project (URL, anon key, service key), Twitch app (client id/secret), EventSub webhook secret, Twitch chat bot token, and a 32-byte `TOKEN_ENCRYPTION_KEY`. Without these, the app builds and unit tests pass, but live EventSub/OAuth/Realtime cannot be exercised.
