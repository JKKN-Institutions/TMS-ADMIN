# TMS Notification Module — Design Spec

- **Date:** 2026-07-03
- **Status:** DRAFT — awaiting user confirmation of the four scoping assumptions (see §3)
- **Reference:** MyJKKN notification system (`github.com/Jicate-Solutions/MyJKKN`) — architecture studied, **not** its tables reused
- **Author:** design produced via the brainstorming skill after deep analysis of both codebases

---

## 1. Problem & motivation

TMS-ADMIN currently emits and reads notifications through the **shared `notifications` table owned by MyJKKN**. That table is a shared, cross-app surface that MyJKKN reshapes on its own schedule. It has already broken TMS once: MyJKKN migrated the `notifications` schema from an old shape (`message`, `target_audience`, `specific_users`, `read_by`, `type`, `is_active`, `enable_*_notification`, …) to its modern shape (`body`, `targeting` jsonb, `kind`, `priority`, `metadata`, …). As a result, most of the TMS notification code now queries **columns that no longer exist**.

**Current TMS state (from codebase audit):** of ~41 notification-touching files, only **6 are alive**:
- 4 writers, all inserting `targeting` jsonb into the shared table via `lib/notifications/notify.ts`:
  - `app/api/admin/enrollment-requests/route.ts` (enrollment approve/reject → learner)
  - `app/api/admin/transport-grievances/route.ts` (grievance reply/status → submitter)
  - `app/api/admin/bookings/send-reminders/route.ts` (booking reminders)
  - `lib/notifications/notify.ts` (`notifyProfile` / `notifyLearner` primitive)
- 2 readers: `app/student/notifications/page.tsx` + `app/api/student/notifications/route.ts` (learner inbox; **no read/unread state** — it just lists rows filtered by `targeting->>user_id`).

Everything else is **dead/broken**: the admin `/notifications` UI, the admin header bell (`components/notification-center.tsx`), all `/api/admin/notifications/**` routes (route/send/push/stats/analytics/bulk-push/mark-all-read/status/[id]/read), both schedule writers, `lib/notification-service.ts` (orphaned), `lib/grievance-notifications.ts`, all web-push code (`push_subscriptions` accessed with defunct `p256dh_key`/`auth_key`/`user_type` columns), and the legacy `types/index.ts` `Notification` interface. The companion `user_notifications` fan-out table is **never touched** anywhere in TMS.

**Goal:** stand up a self-contained, TMS-owned notification module on `tms_`-prefixed tables, modeled on MyJKKN's (sound) modern architecture, so TMS controls its own notification schema and stops depending on / polluting the shared MyJKKN table.

---

## 2. Goals & non-goals

### Goals (v1)
1. TMS-owned tables: `tms_notification` (message) + `tms_notification_recipient` (per-recipient delivery + read state), mirroring MyJKKN's split model.
2. Admin **compose/broadcast** UI with a targeting builder, an admin **list** page, and a **detail** page with delivery stats.
3. **Per-user read/unread state** (the current learner inbox has none).
4. **Realtime** inbox + unread bell across the four portals (admin, learner, driver, boarding).
5. Repoint the 4 alive automated writers to the new table so TMS fully leaves the shared `notifications` table.
6. Modern security posture: `withAuth` + `requirePerm('tms.notifications.*')` + `createServiceRoleClient`, new permission keys seeded into the shared `custom_roles` catalog, and RLS scoping consumers to their own rows.
7. Activity-log instrumentation for admin sends (per the Activity Log module convention).
8. Replace & delete the dead legacy notification code this module supersedes.

### Non-goals (explicitly deferred to later phases — designed so they need no rework)
- **Web push** (VAPID, service worker, `tms_push_subscription`, server-side `web-push` send). *Phase P5.*
- **Mandatory acknowledgment** (blocking read-timer/scroll/quiz gate) + **escalation chain**. *Phase P6.*
- **Action-required** response workflow (`action_responses` / extension requests). *Not planned.*
- **Saved audiences** + **digest/recipient-policy** config-as-data tables. *Not planned unless requested.*
- Email/SMS channels (the existing `lib/email-sms-service.ts` is a console.log stub). *Out of scope.*
- Historical migration of existing shared-table rows into `tms_notification` (start fresh; see §11).

---

## 3. Scoping decisions (ASSUMED — confirm or override)

These four product decisions shape the module. Recommended defaults are assumed in this draft; the user was away when asked and will confirm.

| # | Decision | Assumed answer |
|---|----------|----------------|
| 1 | How much of MyJKKN to replicate in v1 | **In-app core MVP** (split tables, compose/list/detail, read-state, realtime). Push + acknowledgment deferred. |
| 2 | Targeting dimensions | **All four**: broadcast, by portal role, by route, specific users. |
| 3 | Consumer inboxes | **All four portals**: admin (fix bell), learner (repoint), driver (new), boarding (new). |
| 4 | Fate of dead legacy code | **Replace & delete** the dead pages/routes/components. |

---

## 4. Approaches considered

**Approach A — Two-table split (message + recipient), explicit fan-out. ✅ RECOMMENDED.**
Mirrors MyJKKN: one `tms_notification` row + N `tms_notification_recipient` rows resolved and inserted at send time.
*Pros:* correct per-user read state; clean realtime (`user_id=eq.X` on the recipient table); delivery analytics (recipients / reads); acknowledgment & escalation slot straight onto the recipient row later; matches the proven reference.
*Cons:* a broadcast writes N recipient rows (mitigated by chunked inserts); modestly more storage.

**Approach B — Single table + `targeting` jsonb + RLS matcher (no recipient table).**
Essentially the current alive path, but TMS-owned. Read state via a `read_by uuid[]` array or a bolt-on read table.
*Pros:* fewer rows; simplest send.
*Cons:* per-user read state is the whole point and this does it badly — a `read_by` array has concurrency/scaling problems, and a separate read table reinvents the recipient table anyway. Weak delivery analytics; awkward realtime. This is close to what's already broken.

**Approach C — Full MyJKKN parity port** (ack gate, escalation, actions, audiences, digests, push).
*Pros:* every feature.
*Cons:* large, YAGNI for v1; big surface area (blocking gate, cron, service worker, config tables). Not warranted now.

**Chosen: A.** It is the smallest design that is *correct*, and every deferred feature (push, acknowledgment, escalation) attaches to it without rework.

---

## 5. Data model

Naming follows the project's singular `tms_` convention (`tms_route`, `tms_grievance`, `tms_booking`, `tms_activity_log`).

### 5.1 `tms_notification` — the message row (one per send)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `title` | text NOT NULL | |
| `body` | text NOT NULL | plain text / lightweight markup |
| `url` | text NULL | in-app click target (e.g. `/student/grievances`) |
| `icon` | text NULL | optional lucide icon name |
| `category` | text NOT NULL default `'general'` | TMS set: `general, announcement, route, booking, grievance, enrollment, payment, alert, system` |
| `priority` | text NOT NULL default `'normal'` | `low \| normal \| high \| urgent` (CHECK) |
| `targeting` | jsonb NOT NULL | audience selector, see §6 |
| `metadata` | jsonb NOT NULL default `'{}'` | free-form (source module, entity id, …) |
| `created_by` | uuid NULL | actor `profiles.id`; NULL for pure-system sends |
| `recipient_count` | int NOT NULL default 0 | denormalized fan-out size (set at send) |
| `expires_at` | timestamptz NULL | hidden from inboxes once past |
| `idempotency_key` | text NULL | UNIQUE partial index — dedup for automated writers |
| `sent_at` | timestamptz NOT NULL default `now()` | |
| `created_at` | timestamptz NOT NULL default `now()` | |
| `updated_at` | timestamptz NOT NULL default `now()` | touch trigger |

Indexes: `unique (idempotency_key) where idempotency_key is not null`; `(category)`; `(created_at desc)`.

*Deferred P6 columns (added by later ALTER, all nullable/defaulted → no rework):* `requires_acknowledgment bool default false`, `acknowledgment_deadline_hours int`, `kind text default 'announcement'`, `superseded_by uuid`.

### 5.2 `tms_notification_recipient` — per-recipient fan-out + state

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `notification_id` | uuid NOT NULL | FK → `tms_notification(id)` ON DELETE CASCADE |
| `user_id` | uuid NOT NULL | recipient `profiles.id` |
| `read_at` | timestamptz NULL | set when the user reads it |
| `created_at` | timestamptz NOT NULL default `now()` | |

Constraints/indexes: `unique (notification_id, user_id)` (idempotent fan-out); `(user_id, read_at)` (unread count); `(user_id, created_at desc)` (inbox paging); `(notification_id)`.

*Deferred P6 columns:* `acknowledged_at timestamptz`, `escalated_at timestamptz`, `escalation_level int default 0`.

### 5.3 RLS

All admin writes/reads go through **service-role routes** (which bypass RLS) with app-layer `requirePerm`. RLS therefore only needs to protect the **consumer read path**:

- `tms_notification`: `SELECT` allowed when `EXISTS (select 1 from tms_notification_recipient r where r.notification_id = id and r.user_id = auth.uid())`. No direct INSERT/UPDATE/DELETE policy (service-role only).
- `tms_notification_recipient`: `SELECT` and `UPDATE` where `user_id = auth.uid()` (a user sees and marks-read only their own rows). No INSERT/DELETE policy (fan-out is service-role only).

This deliberately avoids calling `user_has_permission()` inside policies (perf); admin visibility is handled by service-role routes.

---

## 6. Targeting model

`targeting` is a jsonb discriminated union, resolved at **send time** into a deduped `profiles.id[]` by `lib/notifications/audience.ts`. Supported shapes:

```jsonc
{ "type": "broadcast" }                                    // every TMS user with a portal identity
{ "type": "role", "roles": ["driver","boarding","student","admin"] }
{ "type": "route", "route_ids": ["<uuid>"], "include": ["passengers","driver"] }
{ "type": "users", "user_ids": ["<profiles.id>", ...] }
{ "type": "user",  "user_id": "<profiles.id>" }            // singular; compat with current notify.ts
```

**Resolution sources (confirmed against live schema):**
- `student` / passengers → `learners_profiles.profile_id` (where `profile_id` not null; optional `bus_required = true`).
- `driver` → `tms_driver.profile_id` (column exists directly).
- `boarding` → `staff.profile_id` where `role_key` = boarding role (exact value confirmed at impl time).
- `admin` → `profiles` with a transport-admin role / `is_super_admin` (predicate finalized at impl time; may use `user_roles`).
- **route → passengers** → distinct `tms_booking.learner_id where route_id = X` → `learners_profiles.profile_id`. ⚠️ **Known limitation:** TMS has no permanent learner↔route assignment table — the link exists only in `tms_booking` (+ `tms_attendance`), and `tms_booking` is largely empty in production today. So route→passenger targeting is only as complete as booking data. Route→**driver** resolves reliably (`tms_route.driver_id` → `staff.profile_id`, `tms_driver.assigned_route_id = X`, and `tms_staff_route_assignment`).
- `broadcast` → union of the four role resolvers.

The resolver **fails closed**: if a requested audience errors, the send is rejected rather than silently delivering to a partial/empty set. Large recipient sets are chunked (≤150–200 ids per `.in()` / batched inserts) per the project's known API-gateway limit on large `.in()` filters.

---

## 7. Server core

### 7.1 `lib/notifications/audience.ts`
`resolveTargeting(svc, targeting): Promise<string[]>` — pure resolver returning deduped `profiles.id[]`. Unit-testable in isolation.

### 7.2 `lib/notifications/dispatch.ts`
`dispatchNotification(svc, input): Promise<{ id: string; recipientCount: number }>` — the single fan-out primitive used by **both** the admin compose route and the automated writers:
1. resolve `targeting` → user_ids;
2. insert the `tms_notification` row (`recipient_count`, `created_by`, optional `idempotency_key`);
3. chunked bulk-insert `tms_notification_recipient` rows (`onConflict (notification_id,user_id)` ignore);
4. return `{ id, recipientCount }`.
Best-effort semantics preserved for automated callers (never throws into the caller; logs on failure).

`lib/notifications/notify.ts` is **repointed** so `notifyProfile` / `notifyLearner` become thin wrappers over `dispatchNotification` with `{ type: 'users', user_ids: [...] }`. The 4 alive writers keep their existing call sites unchanged.

### 7.3 `lib/notifications/fields.ts`
Write whitelist for the compose payload (title, body, url, icon, category, priority, targeting, metadata, expires_at) per the admin-api-route skill convention.

### 7.4 API routes (all `withAuth`; admin ops `requirePerm`)

**Admin (compose / manage):**
- `GET  /api/admin/notifications` — list `tms_notification` with `recipient_count` + read counts + audience summary. `requirePerm('tms.notifications.view')`.
- `POST /api/admin/notifications/send` — validate → `dispatchNotification` → activity-log entry. `requirePerm('tms.notifications.send')`.
- `GET  /api/admin/notifications/[id]` — message + delivery stats (recipients, reads, read %). `requirePerm('tms.notifications.view')`.
- `DELETE /api/admin/notifications/[id]` — delete/expire. `requirePerm('tms.notifications.manage')`.

**Consumers (own inbox — one shared family for all portals):**
- `GET  /api/notifications` — the signed-in user's inbox: join `tms_notification_recipient (user_id = auth.userId)` → `tms_notification`, drop expired, order `created_at desc`, paginate; returns `{ items, unread_count, has_more }`. No extra permission (any authenticated TMS profile reads its own).
- `POST /api/notifications/read` — `{ ids? | all: true }` → set `read_at = now()` on the user's own recipient rows.

The existing `/api/student/notifications` is superseded by `/api/notifications`; the student page is repointed.

---

## 8. Consumer inboxes (client)

- **Shared hook** `hooks/use-tms-notifications.ts`: fetches `/api/notifications`, exposes `{ items, unreadCount, isLoading, hasMore, markRead, markAllRead, loadMore, refresh }`, and subscribes via Supabase realtime `postgres_changes` INSERT on `tms_notification_recipient` filtered `user_id=eq.<profileId>` → prepends new items and bumps the unread count.
- **Shared component** `components/notifications/notification-bell.tsx`: bell + unread badge + dropdown list + "mark all read" + "view all". Portal-agnostic.
- **Wiring:**
  - **Admin:** replace the broken `components/notification-center.tsx` usage in `components/admin-header.tsx` with `<NotificationBell/>`.
  - **Learner:** repoint `app/student/notifications/page.tsx` onto the shared hook/API (adds real read/unread).
  - **Driver:** new `app/driver/notifications/page.tsx` + bell in the driver header.
  - **Boarding:** new `app/boarding/notifications/page.tsx` + bell in the boarding header.

---

## 9. Admin module UI

Follows the project's modern module skills (advanced-data-table, admin-form, admin-detail-page):
- **List** `app/(admin)/notifications/page.tsx` (replaces the dead page): `DataTable` over `tms_notification` — columns: title, category (badge), priority (badge), audience summary, recipients, read %, sent_at, created_by. Search + category/priority filters.
- **Compose** `app/(admin)/notifications/new/page.tsx`: form (title, body, category, priority, url, expires_at) + a **targeting builder** — a radio for `broadcast | role | route | users`, revealing the relevant control (role multiselect / route multiselect + passengers|driver checkboxes / user picker). Live "estimated recipients" count via a small preview call to the resolver. Posts to `/api/admin/notifications/send`.
- **Detail** `app/(admin)/notifications/[id]/page.tsx`: message content + delivery stats (recipient list with read/unread, read %).
- **Nav** `lib/navigation.ts`: point the Notifications entry at `/notifications`, gate on **`tms.notifications.view`** (currently borrows `tms.settings.view`), and drop the dead `push` / `push-subscribers` sub-items.

---

## 10. Permissions

Add to `lib/constants/tms-permissions.ts`:
- `NOTIFICATIONS_VIEW = 'tms.notifications.view'`
- `NOTIFICATIONS_SEND = 'tms.notifications.send'`
- `NOTIFICATIONS_MANAGE = 'tms.notifications.manage'`

Seed them into the shared `custom_roles` catalog and grant to super_admin / transport head via a migration, mirroring `supabase/migrations/20260612000000_grant_all_tms_keys_to_transport_head.sql`. Consumer inbox reads need **no** new permission (authenticated + own-row RLS).

---

## 11. Coexistence, cutover & migration

- **No historical data migration.** The shared `notifications` table carries no per-user read state and mixing histories adds little value. `tms_notification` starts empty. (Optional, not in v1: a one-time best-effort copy of recent TMS-origin rows.)
- **Cutover:** once the 4 writers are repointed to `dispatchNotification` and the learner inbox reads `/api/notifications`, TMS neither writes to nor reads from the shared `notifications` table. Old shared-table notifications simply stop appearing in TMS inboxes (acceptable — small volume, no read state).
- `push_subscriptions` (shared) is left untouched; TMS web push (if built in P5) gets its own `tms_push_subscription`.

---

## 12. Files: new / changed / deleted

**New:** migration(s) for the two tables + RLS + indexes; permission-seed migration; `lib/notifications/audience.ts`, `lib/notifications/dispatch.ts`, `lib/notifications/fields.ts`; `app/api/admin/notifications/send/route.ts`, `app/api/admin/notifications/[id]/route.ts`, `app/api/notifications/route.ts`, `app/api/notifications/read/route.ts`; `hooks/use-tms-notifications.ts`, `components/notifications/notification-bell.tsx`, `components/notifications/columns.tsx`; `app/(admin)/notifications/new/page.tsx`, `app/(admin)/notifications/[id]/page.tsx`; `app/driver/notifications/page.tsx`, `app/boarding/notifications/page.tsx`.

**Changed:** `lib/notifications/notify.ts` (repoint), `lib/constants/tms-permissions.ts`, `lib/navigation.ts`, `components/admin-header.tsx`, `app/(admin)/notifications/page.tsx` (rebuild), `app/student/notifications/page.tsx` (repoint), `app/api/admin/notifications/route.ts` (rebuild GET), driver/boarding headers, `types/index.ts` (drop legacy `Notification`).

**Deleted (dead code — Decision 4):** `app/(admin)/notifications/push/`, `app/(admin)/notifications/push-subscribers/`; dead routes `app/api/admin/notifications/{push,stats,status,analytics,bulk-push,mark-all-read,estimate-users}` + `[id]/read` + `send`(legacy) + `app/api/admin/push/send`; components `broadcast-modal.tsx`, `notification-form-modal.tsx`, `notification-details-modal.tsx`, `admin-push-notifications.tsx`, `bulk-push-notification-form.tsx`, `bulk-notification-monitor.tsx`, `real-time-notifications.tsx`, `notification-center.tsx`; libs `lib/notification-service.ts`, `lib/grievance-notifications.ts` (+ its trigger route + `lib/grievance-workflow.ts` notify hooks); repoint the two schedule writers (`schedules/toggle-status`, `schedules/create-bulk`) to `dispatchNotification`. (`components/enhanced-notifications.tsx` — generic toast/badge UI — is retained if referenced elsewhere; verified at impl time. Exact delete list re-verified against HEAD before removal.)

---

## 13. Implementation phases

- **P0 — Schema & permissions:** two-table migration (+ RLS, indexes, touch trigger); permission keys + seed/grant migration.
- **P1 — Server core:** `audience.ts` (+ vitest), `dispatch.ts`, `fields.ts`; admin `GET` + `/send`; shared `/api/notifications` + `/read`; repoint `notify.ts` + the 4 writers; repoint the 2 schedule writers.
- **P2 — Consumer inboxes:** shared hook + `<NotificationBell>`; wire admin (fix bell), learner (repoint), driver (new), boarding (new); realtime.
- **P3 — Admin UI:** list (data-table), compose (targeting builder + recipient preview), detail (delivery stats); nav update; activity-log wiring.
- **P4 — Cleanup:** delete the dead files (re-verify against HEAD first); drop legacy types.
- **P5 (deferred) — Web push:** `tms_push_subscription`, VAPID, service worker, `web-push` send + stale-sub pruning.
- **P6 (deferred) — Acknowledgment + escalation:** ALTER add ack/escalation columns; blocking gate; overdue → supervisor escalation.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Route→passenger targeting resolves empty (no permanent assignment table; `tms_booking` sparse) | Document as known limitation; still ship role/broadcast/users targeting which are reliable; revisit when booking/allocation data exists. |
| Broadcast fan-out writes thousands of recipient rows | Chunked batched inserts (≤500/insert) + `onConflict` ignore; `recipient_count` denormalized so the list view needn't count. |
| Large `.in()` on recipient resolution overflows the API gateway (known project bug) | Chunk id lists to ≤150–200 per query. |
| Parallel sessions commit to `main` mid-task | Verify HEAD before edits/deletes; never `git add -A`/stash; stage specific files. |
| Deleting dead code removes something still referenced | Re-grep each deletion target against HEAD before removal; keep generic UI primitives that are reused. |
| Agent's Chrome is unauthenticated (auth-gated routes) | Verify headless via `tsc` (changed files) + `curl` route probes (307/401); live render needs the user's browser. |

---

## 15. Testing & verification

- **Unit (vitest):** `resolveTargeting` for each shape (broadcast/role/route/users/user), dedup, empty-audience fail-closed, chunking.
- **Type/build:** `tsc` filtered to changed files (ESLint is broken in this repo — do not rely on `npm run lint`).
- **Route probes:** `curl` the new routes for 401/403 without auth; authenticated smoke via the user's browser (compose → verify a recipient row + realtime bell update + mark-read).
- **DB checks:** after a test send, assert `recipient_count` = `count(tms_notification_recipient)`; RLS: a non-recipient cannot select the row.

---

## 16. Open questions for the user

1. Confirm/override the four scoping assumptions in §3.
2. Admin audience predicate: who counts as a "transport admin" for the `role: admin` audience — a specific `profiles.role` set, `is_super_admin`, or holders of a `tms.*` permission?
3. Boarding `staff.role_key` value(s) to treat as "boarding staff".
4. Should route→passenger targeting date-bound the booking lookup (e.g. active/future bookings only) or take all-time distinct learners on the route?
