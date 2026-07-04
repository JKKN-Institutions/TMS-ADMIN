# PWA Phase 2 — Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a TMS notification to a subscribed user's device (lock screen) across all four portals, by appending one push-send step to the single `dispatchNotification` choke point.

**Architecture:** A new `tms_push_subscription` table (own-row RLS) stores per-device web-push subscriptions. Users opt in via a shared `PushToggle` (in the notification bell + profile pages) that calls user-scoped subscribe/unsubscribe API routes. `dispatchNotification` — through which every admin broadcast and automated notification already flows — calls `sendPushToUsers(...)` inside Next's `after()` so push is sent after the HTTP response, best-effort, pruning dead subscriptions on 410/404. The Phase 1 `public/sw.js` gains `push` + `notificationclick` handlers.

**Tech Stack:** Next.js 16 (App Router, `after` from `next/server`), React 19, Supabase (Postgres + RLS), `web-push` (already a dependency), hand-rolled service worker, Vitest.

## Global Constraints

- **Reuse the Phase 1 service worker** `public/sw.js` — do NOT add a second SW or a Serwist build step.
- **`web-push` is already a dependency** — do not add a push library.
- **Migrations:** `tms_`-prefixed table, additive + idempotent (`create table if not exists`, `drop policy if exists ... create policy`); target the shared MyJKKN Supabase project (ref `kvizhngldtiuufknvehv`).
- **Ownership:** subscribe/unsubscribe use the **user-scoped `auth.supabase` client** (own-row RLS), NOT `createServiceRoleClient()`. `sendPushToUsers` (server dispatch path) uses the service-role client it is already handed.
- **No new TMS permission key.**
- **`VAPID_PRIVATE_KEY` is server-only** — never `NEXT_PUBLIC`. Only the public key is `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- **Chunk any `.in(...)` list to ≤150 ids** (API-gateway limit; see `lib/fees/bills.ts`, `lib/notifications/audience.ts`).
- **Every notification pushes** — no per-message push flag. `priority` rides in the payload for later gating.
- **Verification:** ESLint is broken in this repo — verify with `tsc --noEmit` (filtered to changed files) + `vitest`. Live subscribe/push checks require the USER's authenticated Chrome (agent Chrome is unauthenticated) — those are manual steps.
- **Commit hygiene:** verify `git log -1` before committing (parallel sessions commit to `main`); stage explicit paths, never `git add -A`. End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

## File Structure

**Create**
- `supabase/migrations/20260704120000_create_tms_push_subscription.sql` — subscriptions table + own-row RLS + updated_at trigger.
- `scripts/generate-vapid.js` — one-off VAPID keypair generator.
- `lib/notifications/push-encoding.ts` — `urlBase64ToUint8Array` (pure, isomorphic).
- `lib/notifications/push-encoding.test.ts` — its test.
- `lib/notifications/push.ts` — VAPID config, `buildPushPayload` + `shouldPruneStatus` (pure), `sendPushToUsers` (I/O).
- `lib/notifications/push.test.ts` — tests for the pure helpers.
- `app/api/notifications/push/subscribe/route.ts` — upsert own subscription.
- `app/api/notifications/push/unsubscribe/route.ts` — delete own subscription.
- `lib/notifications/push-client.ts` — browser subscribe/unsubscribe/state.
- `components/pwa/push-toggle.tsx` — shared enable/disable UI.
- `scripts/test-push.js` — manual push tester.

**Modify**
- `lib/notifications/dispatch.ts` — append the `after()` push send.
- `public/sw.js` — add `push` + `notificationclick` handlers.
- `components/notifications/notification-bell.tsx` — mount `<PushToggle variant="bell" />`.
- `app/student/profile/page.tsx`, `app/driver/profile/page.tsx`, admin profile/settings — mount `<PushToggle />`.
- `.env` (local, gitignored) + `.env.local.example` (committed placeholders) — VAPID vars.

---

### Task 1: Migration — `tms_push_subscription` table + own-row RLS

**Files:**
- Create: `supabase/migrations/20260704120000_create_tms_push_subscription.sql`

**Interfaces:**
- Produces: table `public.tms_push_subscription(id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)`, `unique(user_id, endpoint)`, own-row RLS policies for select/insert/update/delete.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- TMS web-push subscriptions — one row per (user, device).
-- Unlike the rest of the notification module (service-role writes), this is
-- USER-OWNED data: subscribe/unsubscribe run under the user-scoped client, so the
-- table carries FULL own-row RLS (select/insert/update/delete where user_id = auth.uid()).
-- The server push-send path reads/prunes via the service-role client (RLS bypassed).
-- Additive + idempotent. Target: shared MyJKKN Supabase (ref: kvizhngldtiuufknvehv).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tms_push_subscription (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                 -- recipient profiles.id (== auth.users.id); soft ref
  endpoint    text not null,                 -- push service URL (unique per device)
  p256dh      text not null,                 -- client public key
  auth        text not null,                 -- client auth secret
  user_agent  text,                          -- human-readable device label
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_tms_push_sub_user on public.tms_push_subscription (user_id);

comment on table public.tms_push_subscription is
  'Web-push subscriptions (one per user+device). User-owned: full own-row RLS.';

-- updated_at touch (dedicated name; do not clobber shared fns)
create or replace function public.tms_push_subscription_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_tms_push_subscription_updated_at on public.tms_push_subscription;
create trigger trg_tms_push_subscription_updated_at
  before update on public.tms_push_subscription
  for each row execute function public.tms_push_subscription_set_updated_at();

alter table public.tms_push_subscription enable row level security;

drop policy if exists tms_push_sub_select_own on public.tms_push_subscription;
create policy tms_push_sub_select_own on public.tms_push_subscription
  for select using (user_id = auth.uid());

drop policy if exists tms_push_sub_insert_own on public.tms_push_subscription;
create policy tms_push_sub_insert_own on public.tms_push_subscription
  for insert with check (user_id = auth.uid());

drop policy if exists tms_push_sub_update_own on public.tms_push_subscription;
create policy tms_push_sub_update_own on public.tms_push_subscription
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists tms_push_sub_delete_own on public.tms_push_subscription;
create policy tms_push_sub_delete_own on public.tms_push_subscription
  for delete using (user_id = auth.uid());
```

- [ ] **Step 2: Apply the migration to the database**

Apply via the Supabase MCP `apply_migration` tool (name `create_tms_push_subscription`, the SQL above) — the project's Supabase MCP targets the real app DB. (No local psql in this repo.)

- [ ] **Step 3: Verify the table exists**

Run (Supabase MCP `execute_sql`): `select count(*) from public.tms_push_subscription;`
Expected: returns `0` (table exists, empty) — not a `42P01` "relation does not exist".

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260704120000_create_tms_push_subscription.sql
git commit -m "feat(notifications): tms_push_subscription table + own-row RLS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: VAPID keys + env + generator script

**Files:**
- Create: `scripts/generate-vapid.js`
- Modify: `.env` (local, gitignored), `.env.local.example` (committed)

**Interfaces:**
- Produces: env vars `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

- [ ] **Step 1: Write the generator script**

```javascript
// One-off VAPID keypair generator for web push. Run: node scripts/generate-vapid.js
// Paste the output into .env (keep VAPID_PRIVATE_KEY server-only) and mirror the
// KEYS (not values) into .env.local.example.
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VAPID_SUBJECT=mailto:transport@jkkn.ac.in');
```

- [ ] **Step 2: Generate keys**

Run: `node scripts/generate-vapid.js`
Expected: three `KEY=value` lines printed.

- [ ] **Step 3: Add the three lines to `.env`** (the real values from Step 2). `.env` is gitignored — do NOT commit real keys.

- [ ] **Step 4: Add placeholder keys to `.env.local.example`**

Append:
```
# Web push (PWA Phase 2). Generate with: node scripts/generate-vapid.js
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:transport@jkkn.ac.in
```

- [ ] **Step 5: Commit** (script + example only; never `.env`)

```bash
git add scripts/generate-vapid.js .env.local.example
git commit -m "feat(notifications): VAPID key generator + env template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `urlBase64ToUint8Array` encoder (TDD)

**Files:**
- Create: `lib/notifications/push-encoding.ts`
- Test: `lib/notifications/push-encoding.test.ts`

**Interfaces:**
- Produces: `urlBase64ToUint8Array(base64String: string): Uint8Array`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from './push-encoding';

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url string to the right bytes', () => {
    // "hello" in base64url is "aGVsbG8"
    const out = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(out)).toEqual([104, 101, 108, 108, 111]);
  });

  it('handles url-safe chars (- and _) and missing padding', () => {
    // bytes [251, 255] → standard base64 "+/8=" → base64url "-_8"
    const out = urlBase64ToUint8Array('-_8');
    expect(Array.from(out)).toEqual([251, 255]);
  });

  it('returns a Uint8Array of the decoded length', () => {
    const out = urlBase64ToUint8Array('aGVsbG8');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/push-encoding.test.ts`
Expected: FAIL — cannot find module `./push-encoding`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Convert a base64url-encoded VAPID public key into the Uint8Array that
 * PushManager.subscribe()'s applicationServerKey expects. Pure + isomorphic
 * (atob is available in browsers and Node 18+).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/push-encoding.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/push-encoding.ts lib/notifications/push-encoding.test.ts
git commit -m "feat(notifications): urlBase64ToUint8Array push key encoder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `lib/notifications/push.ts` — payload/prune helpers (TDD) + `sendPushToUsers`

**Files:**
- Create: `lib/notifications/push.ts`
- Test: `lib/notifications/push.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClient` type from `@/lib/supabase/server`; `web-push`.
- Produces:
  - `interface PushPayload { title: string; body: string; url: string; icon: string; tag: string; priority: string }`
  - `buildPushPayload(p: PushPayload): string`
  - `shouldPruneStatus(statusCode: number): boolean`
  - `sendPushToUsers(svc, userIds: string[], payload: PushPayload): Promise<void>` (best-effort, never throws)

- [ ] **Step 1: Write the failing test (pure helpers only)**

```typescript
import { describe, it, expect } from 'vitest';
import { buildPushPayload, shouldPruneStatus } from './push';

describe('buildPushPayload', () => {
  it('serializes the fields the SW push handler reads', () => {
    const json = buildPushPayload({
      title: 'Bus delayed', body: 'Route 5 is 10m late',
      url: '/student/routes', icon: '/icons/icon-192.png', tag: 'n1', priority: 'high',
    });
    expect(JSON.parse(json)).toEqual({
      title: 'Bus delayed', body: 'Route 5 is 10m late',
      url: '/student/routes', icon: '/icons/icon-192.png', tag: 'n1', priority: 'high',
    });
  });

  it('defaults url and icon when empty', () => {
    const json = buildPushPayload({ title: 'T', body: 'B', url: '', icon: '', tag: 't', priority: '' });
    const parsed = JSON.parse(json);
    expect(parsed.url).toBe('/');
    expect(parsed.icon).toBe('/icons/icon-192.png');
    expect(parsed.priority).toBe('normal');
  });
});

describe('shouldPruneStatus', () => {
  it('prunes on 404 and 410 (subscription gone)', () => {
    expect(shouldPruneStatus(404)).toBe(true);
    expect(shouldPruneStatus(410)).toBe(true);
  });
  it('keeps the subscription on transient/other errors', () => {
    expect(shouldPruneStatus(429)).toBe(false);
    expect(shouldPruneStatus(500)).toBe(false);
    expect(shouldPruneStatus(201)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/push.test.ts`
Expected: FAIL — cannot find module `./push`.

- [ ] **Step 3: Write the implementation**

```typescript
import webpush from 'web-push';
import { createServiceRoleClient } from '@/lib/supabase/server';

type Svc = ReturnType<typeof createServiceRoleClient>;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon: string;
  tag: string;
  priority: string;
}

/** JSON string the service worker `push` handler parses. Pure. */
export function buildPushPayload(p: PushPayload): string {
  return JSON.stringify({
    title: p.title,
    body: p.body,
    url: p.url || '/',
    icon: p.icon || '/icons/icon-192.png',
    tag: p.tag,
    priority: p.priority || 'normal',
  });
}

/** A push endpoint reported gone (subscription revoked/expired) → prune it. Pure. */
export function shouldPruneStatus(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:transport@jkkn.ac.in';
  if (!pub || !priv) {
    console.error('sendPushToUsers: VAPID keys missing — skipping push.');
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

const SUB_CHUNK = 150; // .in() gateway limit
const SEND_CONCURRENCY = 10;

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string }

/**
 * Best-effort: push `payload` to every subscribed device of `userIds`. Prunes
 * subscriptions the push service reports as gone (404/410). NEVER throws — the
 * in-app inbox is the source of truth, so a push failure must not break dispatch.
 * `svc` is the service-role client (RLS bypassed) already held by the caller.
 */
export async function sendPushToUsers(svc: Svc, userIds: string[], payload: PushPayload): Promise<void> {
  try {
    if (userIds.length === 0 || !ensureVapid()) return;
    const ids = [...new Set(userIds)];

    const subs: SubRow[] = [];
    for (let i = 0; i < ids.length; i += SUB_CHUNK) {
      const chunk = ids.slice(i, i + SUB_CHUNK);
      const { data, error } = await svc
        .from('tms_push_subscription')
        .select('id, endpoint, p256dh, auth')
        .in('user_id', chunk);
      if (error) {
        console.error('sendPushToUsers: load subscriptions failed:', error.message);
        return;
      }
      subs.push(...((data ?? []) as SubRow[]));
    }
    if (subs.length === 0) return;

    const body = buildPushPayload(payload);
    const stale: string[] = [];

    for (let i = 0; i < subs.length; i += SEND_CONCURRENCY) {
      const batch = subs.slice(i, i + SEND_CONCURRENCY);
      await Promise.all(
        batch.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body,
            );
          } catch (e: unknown) {
            const status = (e as { statusCode?: number })?.statusCode ?? 0;
            if (shouldPruneStatus(status)) stale.push(s.id);
          }
        }),
      );
    }

    for (let i = 0; i < stale.length; i += SUB_CHUNK) {
      const chunk = stale.slice(i, i + SUB_CHUNK);
      const { error } = await svc.from('tms_push_subscription').delete().in('id', chunk);
      if (error) console.error('sendPushToUsers: prune failed:', error.message);
    }
  } catch (e) {
    console.error('sendPushToUsers (non-fatal):', e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/push.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/push.ts lib/notifications/push.test.ts
git commit -m "feat(notifications): sendPushToUsers + push payload/prune helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Subscribe + unsubscribe API routes

**Files:**
- Create: `app/api/notifications/push/subscribe/route.ts`
- Create: `app/api/notifications/push/unsubscribe/route.ts`

**Interfaces:**
- Consumes: `withAuth`, `AuthContext` (`auth.userId`, `auth.supabase`); table `tms_push_subscription`.
- Produces: `POST /api/notifications/push/subscribe` (body `{ endpoint, keys:{p256dh,auth}, userAgent }`), `POST /api/notifications/push/unsubscribe` (body `{ endpoint }`).

- [ ] **Step 1: Write the subscribe route**

`app/api/notifications/push/subscribe/route.ts`:
```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';

/**
 * POST — upsert the caller's push subscription. Uses the USER-scoped client so the
 * own-row RLS insert/update policies enforce ownership (user_id = auth.uid()).
 */
async function handlePost(request: NextRequest, auth: AuthContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
      userAgent?: unknown;
    };
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
    const authKey = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: 'endpoint and keys are required' }, { status: 400 });
    }
    const userAgent = typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : null;

    const { error } = await auth.supabase.from('tms_push_subscription').upsert(
      {
        user_id: auth.userId,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    );
    if (error) {
      console.error('push/subscribe upsert:', error.message);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('POST /api/notifications/push/subscribe:', e);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
```

- [ ] **Step 2: Write the unsubscribe route**

`app/api/notifications/push/unsubscribe/route.ts`:
```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';

/** POST — delete the caller's subscription for a given endpoint (own-row RLS). */
async function handlePost(request: NextRequest, auth: AuthContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });

    const { error } = await auth.supabase
      .from('tms_push_subscription')
      .delete()
      .eq('user_id', auth.userId)
      .eq('endpoint', endpoint);
    if (error) {
      console.error('push/unsubscribe delete:', error.message);
      return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('POST /api/notifications/push/unsubscribe:', e);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "push/subscribe|push/unsubscribe" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add app/api/notifications/push/subscribe/route.ts app/api/notifications/push/unsubscribe/route.ts
git commit -m "feat(notifications): push subscribe/unsubscribe API routes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Browser push client

**Files:**
- Create: `lib/notifications/push-client.ts`

**Interfaces:**
- Consumes: `urlBase64ToUint8Array`; the subscribe/unsubscribe routes; `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; the Phase 1 `/sw.js`.
- Produces: `type PushState = 'unsupported'|'denied'|'default'|'subscribed'`; `getPushState()`, `subscribeToPush()`, `unsubscribeFromPush()` — all `Promise<PushState>`.

- [ ] **Step 1: Write the client**

```typescript
'use client';

import { urlBase64ToUint8Array } from '@/lib/notifications/push-encoding';

export type PushState = 'unsupported' | 'denied' | 'default' | 'subscribed';

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'default';
}

export async function subscribeToPush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    console.error('subscribeToPush: NEXT_PUBLIC_VAPID_PUBLIC_KEY missing');
    return 'default';
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }));

  const json = sub.toJSON();
  await fetch('/api/notifications/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
  });
  return 'subscribed';
}

export async function unsubscribeFromPush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);
    await fetch('/api/notifications/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ endpoint }),
    });
  }
  return Notification.permission === 'denied' ? 'denied' : 'default';
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "push-client" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/push-client.ts
git commit -m "feat(notifications): browser push subscribe/unsubscribe client

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Shared `PushToggle` component

**Files:**
- Create: `components/pwa/push-toggle.tsx`

**Interfaces:**
- Consumes: `getPushState`, `subscribeToPush`, `unsubscribeFromPush`, `PushState`.
- Produces: `default export PushToggle({ variant }: { variant?: 'bell' | 'row' })`.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from '@/lib/notifications/push-client';

/**
 * Enable/disable web push. Shared across all portals: `variant="bell"` renders a
 * compact row for the notification-bell dropdown; `variant="row"` renders a
 * full-width settings row for profile pages. Renders nothing when push is
 * unsupported (SSR-safe: resolves state after mount).
 */
export default function PushToggle({ variant = 'row' }: { variant?: 'bell' | 'row' }) {
  const [state, setState] = useState<PushState>('default');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then((s) => {
      setState(s);
      setReady(true);
    });
  }, []);

  if (!ready || state === 'unsupported') return null;

  const on = state === 'subscribed';
  const denied = state === 'denied';

  const toggle = async () => {
    setBusy(true);
    try {
      setState(on ? await unsubscribeFromPush() : await subscribeToPush());
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'bell') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy || denied}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-600 border-t border-gray-100 hover:bg-gray-50 disabled:opacity-60 dark:text-gray-300 dark:border-gray-800 dark:hover:bg-gray-800/60"
      >
        {on ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
        {denied
          ? 'Notifications blocked in browser settings'
          : on
            ? 'Push on — tap to turn off'
            : 'Enable push notifications'}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Push notifications</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {denied
            ? 'Blocked — re-enable in your browser settings.'
            : on
              ? 'This device receives push notifications.'
              : 'Get notified on this device even when the app is closed.'}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || denied}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
          on
            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {on ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        {on ? 'Turn off' : 'Enable'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "push-toggle" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add components/pwa/push-toggle.tsx
git commit -m "feat(notifications): shared PushToggle component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Mount `PushToggle` in the bell + profile pages

**Files:**
- Modify: `components/notifications/notification-bell.tsx`
- Modify: `app/student/profile/page.tsx`, `app/driver/profile/page.tsx`, admin profile/settings page

**Interfaces:**
- Consumes: `PushToggle` from `@/components/pwa/push-toggle`.

- [ ] **Step 1: Import PushToggle in the bell**

In `components/notifications/notification-bell.tsx`, add after the existing imports (below the `useTmsNotifications` import):
```tsx
import PushToggle from '@/components/pwa/push-toggle';
```

- [ ] **Step 2: Render the bell CTA in the dropdown**

In the same file, inside the dropdown `<div className="absolute right-0 mt-2 ...">`, add `<PushToggle variant="bell" />` immediately BEFORE the `{viewAllHref && (` footer link (i.e. right after the closing `</div>` of the `max-h-96 overflow-y-auto` list container):
```tsx
          <PushToggle variant="bell" />

          {viewAllHref && (
```

- [ ] **Step 3: Mount on the profile pages**

For each of `app/student/profile/page.tsx`, `app/driver/profile/page.tsx`, and the admin profile/settings page: add `import PushToggle from '@/components/pwa/push-toggle';` and render `<PushToggle />` inside a settings/account card (e.g. below the profile-details section). (Boarding has no profile page — the bell CTA covers it.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "notification-bell|profile" || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git add components/notifications/notification-bell.tsx app/student/profile/page.tsx app/driver/profile/page.tsx
# plus the admin profile/settings page you edited
git commit -m "feat(notifications): surface PushToggle in bell + profile pages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Wire push into `dispatchNotification`

**Files:**
- Modify: `lib/notifications/dispatch.ts`

**Interfaces:**
- Consumes: `sendPushToUsers` from `./push`; `after` from `next/server`.

- [ ] **Step 1: Add imports**

At the top of `lib/notifications/dispatch.ts`, below the existing imports:
```typescript
import { after } from 'next/server';
import { sendPushToUsers } from '@/lib/notifications/push';
```

- [ ] **Step 2: Append the push send after fan-out**

In `dispatchNotification`, replace the final `return { id: notificationId, recipientCount: userIds.length };` with:
```typescript
  // Best-effort device push AFTER the HTTP response (never blocks the send). If we're
  // somehow outside a request scope (after() throws), fall back to fire-and-forget.
  const push = () =>
    sendPushToUsers(svc, userIds, {
      title: input.title,
      body: input.body,
      url: input.url ?? '/',
      icon: input.icon ?? '/icons/icon-192.png',
      tag: notificationId,
      priority: input.priority ?? 'normal',
    });
  try {
    after(push);
  } catch {
    void push();
  }

  return { id: notificationId, recipientCount: userIds.length };
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "dispatch" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Run the notification test suite (no regressions)**

Run: `npx vitest run lib/notifications`
Expected: PASS (push-encoding + push tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/dispatch.ts
git commit -m "feat(notifications): push every dispatch after() to subscribed devices

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Service worker `push` + `notificationclick` handlers

**Files:**
- Modify: `public/sw.js`

**Interfaces:**
- Consumes: the payload shape from `buildPushPayload` (`{ title, body, url, icon, tag, priority }`).

- [ ] **Step 1: Append the handlers to `public/sw.js`** (after the existing `message` listener; additive — does not touch caching):

```javascript
// ── Web push (Phase 2) ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'JKKN TMS', body: event.data.text() };
  }
  const title = data.title || 'JKKN TMS';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: Verify the SW still serves (dev server running)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sw.js`
Expected: `200`.

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(pwa): service worker push + notificationclick handlers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Manual push tester + full verification

**Files:**
- Create: `scripts/test-push.js`

**Interfaces:**
- Consumes: `web-push`, VAPID env, a subscription row's `endpoint`/`keys`.

- [ ] **Step 1: Write the tester script**

```javascript
// Send a test push to ONE subscription. Usage:
//   node -r dotenv/config scripts/test-push.js '<subscription-json>'
// where <subscription-json> is { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
// (copy a row from tms_push_subscription). Falls back to reading VAPID from process.env.
const webpush = require('web-push');

const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:transport@jkkn.ac.in';
if (!pub || !priv) {
  console.error('Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in the environment.');
  process.exit(1);
}
webpush.setVapidDetails(subject, pub, priv);

const sub = JSON.parse(process.argv[2] || '{}');
webpush
  .sendNotification(
    sub,
    JSON.stringify({ title: 'JKKN TMS test', body: 'Push is working 🎉', url: '/', icon: '/icons/icon-192.png', tag: 'test' })
  )
  .then(() => console.log('✓ sent'))
  .catch((e) => { console.error('✗ failed', e.statusCode, e.body); process.exit(1); });
```

- [ ] **Step 2: Full type-check of all changed files**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "notifications/push|push-toggle|push/subscribe|push/unsubscribe|dispatch" || echo "✓ clean"
```
Expected: `✓ clean`.

- [ ] **Step 3: Full notification test suite**

Run: `npx vitest run lib/notifications`
Expected: PASS.

- [ ] **Step 4: Manual verification (USER's authenticated Chrome — agent Chrome is unauthenticated)**

Document for the user:
1. Ensure the app is installed (Phase 1) — on iOS, push requires the installed Home-Screen app (iOS 16.4+).
2. Open the notification bell → "Enable push notifications" → grant permission.
3. From the admin portal, compose & send a notification targeting yourself (or trigger an automated one).
4. Confirm the device shows the notification; click it → the app opens/focuses at the notification's URL.
5. In DevTools → Application → Service Workers, revoke the subscription, send again → confirm the stale row is pruned (a 410 in server logs; row deleted from `tms_push_subscription`).

- [ ] **Step 5: Commit**

```bash
git add scripts/test-push.js
git commit -m "chore(notifications): manual web-push tester script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Data model (`tms_push_subscription` + own-row RLS) → Task 1 ✓
- VAPID keys + env + `push.ts` config → Task 2, Task 4 ✓
- Subscribe flow (API routes user-scoped) → Task 5 ✓; client → Task 6 ✓; shared toggle in bell + profile → Task 7, Task 8 ✓
- Dispatch wiring (`after()` + `sendPushToUsers`, zero caller changes) → Task 9 ✓
- SW `push` + `notificationclick` → Task 10 ✓
- Permissions/security (no new key, VAPID private server-only, own-row RLS) → Tasks 1, 2, 5 ✓
- Error handling/testing (410/404 prune, best-effort, pure-logic tests, test-push, manual) → Tasks 4, 11 ✓
- Out-of-scope (per-category prefs, iOS constraint) → not built, iOS noted in Task 11 ✓

**Placeholder scan:** none — every code step contains complete code; the profile-page mount (Task 8 Step 3) names exact files and the exact import/element, leaving only in-file placement (which depends on the current file) to the implementer.

**Type consistency:** `PushState`, `PushPayload`, `buildPushPayload`, `shouldPruneStatus`, `sendPushToUsers`, `getPushState`/`subscribeToPush`/`unsubscribeFromPush`, and `PushToggle({ variant })` are used with identical names/signatures across Tasks 3–10. The dispatch payload object (Task 9) matches `PushPayload` (Task 4) field-for-field. The SW reads exactly the keys `buildPushPayload` writes.
