# PWA — Phase 2: Web Push Notifications

**Date:** 2026-07-04
**Status:** Approved (design) — pending implementation plan
**Skill origin:** `.claude/skills/nextjs-pwa-skill` (Phase 2 of the phased PWA rollout)
**Depends on:** Phase 1 (`2026-07-03-pwa-phase1-installable-offline-shell-design.md`) — the
unified installable app + `public/sw.js` this phase extends.

## Context

TMS-ADMIN is a single Next.js 16 / React 19 App-Router app hosting four portals
(Admin at root, `/student`, `/driver`, `/boarding`). Phase 1 shipped one installable
PWA (`scope: "/"`) with a hand-rolled `public/sw.js` (offline app shell).

TMS owns its notification stack on the `tms_notification` / `tms_notification_recipient`
tables. Every notification — admin broadcasts AND automated writers (enrollment,
grievance, booking reminders) — flows through a single primitive,
`dispatchNotification()` in `lib/notifications/dispatch.ts`, which resolves the audience
to `profiles.id`s, inserts the message row, and fans out recipient rows. The in-app
inbox (bell + per-portal inbox) updates live via Supabase Realtime on
`tms_notification_recipient`. `web-push` is already a dependency, currently unused.

## Goal

Deliver **web push notifications** so a TMS notification reaches a subscribed user's
device (lock screen), across all four portals — as the natural extension of the
single dispatch choke point. This is Phase 2 of the phased PWA rollout.

### Non-goals (later phases / explicitly out of scope)
- **Phase 3** — offline data reads + queued writes (IndexedDB / background sync).
- **Per-user preferences** beyond subscribe/unsubscribe per device (no per-category
  toggles, no quiet hours). v1 is on/off.
- Rich push (images, inline action buttons).

## Decisions

1. **Trigger policy:** **every** notification also attempts a push to the recipient's
   subscribed devices. No per-message push flag — the user's per-device opt-in is the
   only control. `priority` is carried in the payload so gating can be added later
   without schema change.
2. **Opt-in UX:** user-initiated (browsers require a click for the permission prompt).
   Surfaced in **BOTH** the shared notification bell (a CTA, appears in all four portals
   via the one shared component) **and** a durable toggle on each portal's profile page.
3. **Delivery model:** **inline via Next `after()`** — push is sent after the HTTP
   response, in the same request, from inside `dispatchNotification`. No new
   infrastructure; instant delivery; all push logic lives beside dispatch. Bounded only
   by function max-duration on very large broadcasts (acceptable at current scale).
   Upgrade path: the send block lifts into a cron drainer later without touching the
   subscription table, SW, or UI.
4. **One SW:** reuse the Phase 1 `public/sw.js`; add `push` + `notificationclick`
   handlers. No second service worker.
5. **No new permission key:** a subscription is the user's own data (own-row RLS).
   Sending is already gated because dispatch is only reached via permission-checked
   routes / trusted automated writers.

## Design

### 1. Data model — `tms_push_subscription` (new migration)
Columns:
- `id` uuid PK default `gen_random_uuid()`
- `user_id` uuid NOT NULL — `profiles.id` (== `auth.uid`); **soft ref, no FK** (project
  convention for profiles refs), indexed
- `endpoint` text NOT NULL — the device's push-service URL
- `p256dh` text NOT NULL, `auth` text NOT NULL — the subscription's client keys
- `user_agent` text NULL — human-readable device label ("Chrome on Android")
- `created_at` timestamptz default now(), `updated_at` timestamptz default now()
  (maintained by the shared `tms_set_updated_at` trigger)
- **UNIQUE(`user_id`, `endpoint`)** — one row per device; re-subscribe = upsert

RLS enabled with **own-row policies** (`user_id = auth.uid()`) for select/insert/update/
delete. This is the one TMS table users write directly (via a user-scoped route), unlike
the module's service-role-only tables.

Migration file: `supabase/migrations/<ts>_create_tms_push_subscription.sql` (idempotent,
per repo convention; applied to the shared prod DB via the MyJKKN pipeline / Supabase MCP).

### 2. VAPID keys + config
- `scripts/generate-vapid.js` (or `npx web-push generate-vapid-keys`) → keypair.
- Env vars:
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — client, used to subscribe
  - `VAPID_PRIVATE_KEY` — **server-only** (never `NEXT_PUBLIC`)
  - `VAPID_SUBJECT` — `mailto:` contact
  - Added to `.env` and documented in `.env.local.example`.
- `lib/notifications/push.ts`: calls `web-push.setVapidDetails(...)` once at module load;
  exports `sendPushToUsers(svc, userIds, payload)`.

### 3. Subscribe flow (client + API)
- **API routes** (both `withAuth`, using the **user-scoped** Supabase client so own-row
  RLS applies — NOT service-role):
  - `POST /api/notifications/push/subscribe` — upsert the caller's `tms_push_subscription`
    row from the browser `PushSubscription` JSON (endpoint + keys + user_agent).
  - `POST /api/notifications/push/unsubscribe` — delete the caller's row by `endpoint`.
- **Client helper** `lib/notifications/push-client.ts`:
  - `getState()` → 'unsupported' | 'denied' | 'default' | 'subscribed'
  - `subscribe()` → request permission (on user gesture) → `pushManager.subscribe`
    with `applicationServerKey = urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY)`
    against the existing `/sw.js` → POST /subscribe
  - `unsubscribe()` → `pushManager.getSubscription()` → `.unsubscribe()` → POST /unsubscribe
- **UI** — one shared `components/pwa/push-toggle.tsx`:
  - Renders Enable/Disable based on `getState()`; hidden when `unsupported`; shows a short
    hint when `denied` (user must re-enable in browser settings).
  - Mounted **(a)** as a compact CTA inside the shared `components/notifications/notification-bell.tsx`
    dropdown → appears in all four portals with one change; **(b)** as a durable row on
    each portal's profile/settings page.
  - Mount points: `app/student/profile`, `app/driver/profile`, admin settings/profile.
    **Boarding has no dedicated profile page** → the bell CTA + shared
    `components/portal-user-menu.tsx` (`ProfileMenu`) carry it for that portal.

### 4. Dispatch wiring — `lib/notifications/dispatch.ts`
After the recipient fan-out succeeds and before returning `DispatchResult`:
```ts
import { after } from 'next/server';
// ...after fan-out...
after(() =>
  sendPushToUsers(svc, userIds, {
    title: input.title,
    body: input.body,
    url: input.url ?? '/',
    icon: input.icon ?? '/icons/icon-192.png',
    tag: notificationId,
    priority: input.priority ?? 'normal',
  }),
);
```
`sendPushToUsers` (in `lib/notifications/push.ts`):
- loads `tms_push_subscription` for `userIds` (chunked `.in()`, ≤150 per the gateway limit)
- sends `web-push.sendNotification` with a **concurrency cap (~10)**
- on `404`/`410 Gone` → **deletes** that subscription row (self-healing)
- is **best-effort**: catches all errors, never throws into dispatch (the in-app inbox is
  the source of truth). Every dispatch path — admin broadcast + all `notify.ts` automated
  writers — gets push with **zero caller changes**.

### 5. Service worker — extend `public/sw.js` (Phase 1)
Additive, does not touch the caching logic:
- `self.addEventListener('push', ...)` → parse `event.data.json()` →
  `self.registration.showNotification(title, { body, icon, badge, tag, data: { url } })`.
- `self.addEventListener('notificationclick', ...)` → `notification.close()`; focus an
  already-open same-origin client at the URL, else `clients.openWindow(url)`.
- `badge`: reuse `/icons/icon-192.png` for v1 (a dedicated monochrome badge-72 is a nice-
  to-have, not required).

### 6. Permissions / security
- No new TMS permission. Subscribe/unsubscribe act on own rows (own-row RLS).
- `VAPID_PRIVATE_KEY` stays server-only; a user cannot read another user's subscriptions.

### 7. Error handling + testing
- Push is best-effort; a push failure never affects the notification or its inbox row.
- `410/404` self-heals by pruning the dead subscription.
- Unit tests (Vitest, pure logic only): `urlBase64ToUint8Array`, the push payload builder,
  and the "prune on which status code" decision. Actual `web-push` I/O stays behind a thin
  wrapper (not unit-tested).
- `scripts/test-push.js`: send a test push to a given subscription.
- Manual verification (user's authenticated Chrome — agent Chrome is unauthenticated):
  enable in bell/profile → grant permission → send a notification → device shows it →
  click opens the target URL. Re-subscribe/unsubscribe round-trips correctly.

## Files

**Create**
- `supabase/migrations/<ts>_create_tms_push_subscription.sql`
- `lib/notifications/push.ts` (VAPID config + `sendPushToUsers`)
- `lib/notifications/push-client.ts` (browser subscribe/unsubscribe/state)
- `components/pwa/push-toggle.tsx`
- `app/api/notifications/push/subscribe/route.ts`
- `app/api/notifications/push/unsubscribe/route.ts`
- `scripts/generate-vapid.js`
- unit test files under `lib/notifications/`

**Modify**
- `lib/notifications/dispatch.ts` (append `after()` push send)
- `public/sw.js` (add `push` + `notificationclick` handlers)
- `components/notifications/notification-bell.tsx` (mount the CTA)
- per-portal profile pages (`app/student/profile`, `app/driver/profile`, admin) +
  `components/portal-user-menu.tsx` for boarding
- `.env`, `.env.local.example` (VAPID vars)

## Verification

- `tsc` on changed files (ESLint is broken in this repo).
- Vitest on the new pure-logic tests.
- Dev-server: subscribe/unsubscribe routes return 200 for an authed user; a test push
  round-trips.
- Manual (user's Chrome, installed PWA on mobile): permission grant → device notification
  → click routes correctly; `410` pruning removes a revoked subscription.

## Risks

- **iOS:** web push works only on iOS 16.4+ AND only when the app is installed to the Home
  Screen — Phase 1 delivers installability; documented constraint, no extra work.
- **`after()` on very large broadcasts:** bounded by function max-duration. Acceptable at
  current scale (~859 learners); upgrade path is a cron drainer (Phase 2.1) with no schema/
  SW/UI change.
- **Permission denial is sticky:** once a user blocks notifications, the app can't re-prompt
  — the toggle shows a "re-enable in browser settings" hint rather than a dead button.
- **VAPID key rotation** invalidates existing subscriptions (they'd re-subscribe on next
  toggle); keys are set-once in env.
