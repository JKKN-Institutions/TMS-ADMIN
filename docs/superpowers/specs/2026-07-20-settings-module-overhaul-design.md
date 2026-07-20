# Settings Module Overhaul — Design

- **Date:** 2026-07-20
- **Status:** Approved (design), pending implementation plan
- **Author:** Admin (aiahs@jkkn.ac.in) + Claude
- **Area:** `app/(admin)/settings`, `lib/booking`, `lib/boarding`, `lib/notifications`, boarding scan flow

## 1. Problem & context

The admin **Settings** module (`app/(admin)/settings/page.tsx`, a single ~900-line client component) exposes six tabs — General, Scheduling, Attendance, Notifications, Security, System — but only two are wired to a backend, and one of those two is actively misleading.

Current state per tab:

| Tab | Backing store | Reality today |
|-----|---------------|---------------|
| General | none | Local React state; "Save" only toasts |
| **Scheduling** | `admin_settings` table via `/api/admin/settings` | Persists, **but the values are never read by the booking engine** |
| **Attendance** | `tms_attendance_window` via `/api/admin/attendance-windows` | Fully wired (modern pattern); configures Onward + Return windows |
| Notifications | none | Six local toggles (email/SMS/push/…); no persistence, no effect |
| Security | none | Local state (session/2FA/IP); nothing enforced |
| System | none | 100% hardcoded fake data + buttons that only toast |

### The central defect — booking cutoff is a three-way disconnect

1. `lib/scheduling-config.ts` — a `SchedulingConfigManager` reading/writing **`localStorage`** (`bookingWindowStartHour/EndHour`…). Legacy, effectively dead.
2. `admin_settings` table (via `/api/admin/settings`) — what the Scheduling tab actually saves: `enableBookingTimeWindow`, `bookingWindowEndHour` (default **19 / 7 PM**), `bookingWindowDaysBefore`, `autoNotifyPassengers`, `sendReminderHours`.
3. `lib/booking/window.ts` — the code that **actually** gates student booking, with a hardcoded `CUTOFF_HOUR_IST = 20` (8 PM). This is what `effectiveOpen()` (in `lib/booking/calendar.ts`) and `POST /api/student/bookings` enforce.

An admin can set "Booking Cutoff Time = 7 PM," see it save, and observe **no change** — the enforcement path hardcodes 8 PM. The reminder text even hardcodes "closes at 8 PM" while the setting says 7 PM.

### Other relevant existing assets

- `POST /api/admin/bookings/send-reminders` already builds and dispatches an idempotent in-app booking reminder to transport learners with no booking for tomorrow, through the real notification module (`lib/notifications/dispatch.ts` → `dispatchNotification`). Its own comment says it should be wired to a scheduler later. There is **no cron** configured (`vercel.json` only sets `regions:["bom1"]`).
- The notification module (`tms_notification` / `tms_notification_recipient`, `dispatchNotification`, `resolveTargeting`) is **in-app web only**. The old email/SMS senders were deleted; web-push is deferred. So the Notifications tab's Email/SMS/Push toggles map to channels that do not exist.
- Boarding attendance supports **two** directions (Onward morning, Return evening) across `lib/boarding/attendance-window.ts`, the Settings editor, and the scan flow (`app/boarding/attendance/page.tsx`, `components/boarding/scan-dialog.tsx`, `app/api/boarding/scan/route.ts`).
- Auth is delegated to the parent MyJKKN identity provider (OAuth), so session timeout / password expiry / 2FA are **not** settable inside this app.

## 2. Goals

1. Make the admin-configured **booking cutoff hour** AND the **bookable horizon length** ("booking days available" = how many days ahead) actually govern student booking (wire `admin_settings` → enforcement).
2. Deliver **automatic** daily learner booking reminders (existing reminder logic + a real trigger), reflecting the configured cutoff.
3. Reduce attendance to **Onward (morning) only** — remove the Return/evening path from settings and the scan flow, without destroying historical data.
4. Make the **Notifications / Security / System** tabs real and honest — controls that affect real behavior, real read-only data, and removal of misleading fakes.
5. Harden the settings write API to the modern `withAuth` + `requirePerm` pattern.

## 3. Non-goals

- Per-weekday selection of which days are bookable — only the horizon **length** (`bookingDaysAhead` = how many days ahead) and the daily cutoff hour are configurable. Sunday remains the fixed weekly holiday and service-calendar exceptions still apply.
- Building email / SMS / web-push channels.
- Implementing app-side session timeout, 2FA, IP restriction, or password expiry (owned by the external identity provider).
- Deleting historical `tms_attendance` return rows or the `tms_attendance_window` return row.
- Reviving `lib/scheduling-config.ts` (the dead localStorage manager); it is superseded by the DB-backed path and may be removed if no live importer remains.

## 4. Phased design

Each phase is independently shippable, testable, and mergeable.

### Phase 1 — Make the booking cutoff real

**Principle:** keep the pure, unit-tested booking libraries pure; inject configuration at the server edge.

- `lib/booking/window.ts`
  - `cutoffFor(travelDate: string, cutoffHour = 20): Date` — add an optional hour parameter; default preserves current behavior. Internally replace the `CUTOFF_HOUR_IST` constant use with the param.
  - `bookableDates(now = new Date(), daysAhead = 7): string[]` — replace the fixed weekly window with a **configurable rolling horizon**: `today+1 … today+daysAhead` inclusive. Default `7` (closest to the old "one week" feel). Sundays inside the range stay in the list but remain non-bookable via `isSunday` (unchanged). `bookingWeekEnd()` becomes unused by the horizon; retain only if still referenced elsewhere, otherwise remove with its tests.
  - `isBookingOpen`, `dayStatus`, `isCancelable` accept the same optional `daysAhead`/`cutoffHour` (defaulting) so unrelated callers are unaffected; `isSunday` unchanged.
- `lib/booking/calendar.ts`
  - `effectiveOpen(date, opts)` — accept optional `cutoffHour` AND `daysAhead` in `opts`; use them for the fallback deadline (`cutoffFor(date, cutoffHour)`) and the horizon check (`bookableDates(now, daysAhead)`); a per-date `window.deadline` override still wins over the cutoff.
  - `cellStatus` / `buildMonthCells` — thread `daysAhead` so the calendar's `out_of_horizon` greying matches the configured horizon.
- New `lib/settings/scheduling.ts`
  - `loadSchedulingConfig(svc): Promise<{ enableBookingTimeWindow: boolean; cutoffHour: number; daysAhead: number; autoNotifyPassengers: boolean }>` — reads the `admin_settings` row (`setting_type='scheduling'`), returns a safe default (`{ enableBookingTimeWindow: true, cutoffHour: 20, daysAhead: 7, autoNotifyPassengers: true }`) if missing/malformed. Clamps `cutoffHour` to 0..23 and `daysAhead` to 1..14. `cutoffHour` ← stored `bookingWindowEndHour`; `daysAhead` ← stored `bookingDaysAhead`. This single loader is the shared source of truth used by Phase 1 (enforcement), Phase 2 (reminders), and the student board.
  - Semantics: `enableBookingTimeWindow === false` ⇒ the daily time-cutoff is **bypassed** (booking stays open until the travel day, still within the configured `daysAhead` horizon and still blocked on Sundays / service-calendar exceptions).
- `app/api/student/bookings/route.ts`
  - GET board: load `loadSchedulingConfig(svc)` and build the horizon with `bookableDates(now, daysAhead)`; the month view threads `daysAhead` into `buildMonthCells` for correct greying.
  - `book` action: thread `cutoffHour`, `daysAhead`, and the enable flag into `effectiveOpen`. When `enableBookingTimeWindow` is off, skip the time-cutoff gate but keep horizon + Sunday + exception gates.
- `app/api/admin/settings/route.ts` — **harden**:
  - Convert `GET`/`POST`/`PUT` to `withAuth`; require `requirePerm('tms.settings.manage')` on writes (GET may allow `tms.settings.view` or the same manage perm — decided in plan).
  - Replace direct `supabaseAdmin` import with `createServiceRoleClient()` inside the handler after the permission check.
  - Add `logActivity({ module: 'settings', action: 'update', ... })` on write, mirroring the attendance-windows route.
  - Validation: `bookingWindowEndHour` 0..23; `bookingDaysAhead` 1..14 (replacing the old `bookingWindowDaysBefore >= 1` check).

**Rejected alternative:** reading `admin_settings` directly inside `window.ts`. Rejected — it would make the pure module impure, add a DB call to calendar math, and break `window.test.ts`.

**UI:** the Scheduling tab keeps the fields that now drive behavior — `enableBookingTimeWindow`, `bookingWindowEndHour` (cutoff), and the repurposed days field now storing **`bookingDaysAhead`**, labeled **"Booking days available (days ahead)"** (min 1, max 14). The "Current Booking Policy" info box stops hardcoding "8 PM" and renders the configured cutoff + the configured horizon. The **"Reminder Hours"** checkboxes (the reminder model is "daily, before cutoff", not the [24,2]-hour model) are removed/relabeled read-only, per the "no decorative settings" principle. `autoNotifyPassengers` stays but its canonical control moves to the Notifications tab (Phase 4).

### Phase 2 — Automatic learner booking reminders

- New `lib/booking/reminders.ts`
  - `sendBookingReminders(svc, { createdBy }): Promise<{ date: string; reminded: number }>` — the current body of `send-reminders/route.ts`, extracted verbatim. **Targeting (explicit):** the reminder goes ONLY to transport learners (`bus_required`, with a route + a login profile) who have **no booking** for the target date and were not already reminded — learners who already booked, and non-transport users, are never notified. Plus:
    - Read `loadSchedulingConfig(svc)`; if `autoNotifyPassengers` is off (from the scheduling settings), return `{ date, reminded: 0 }` without dispatching.
    - Build the message body from the configured cutoff hour (e.g. "closes at 7 PM today"), not a hardcoded 8 PM.
  - Preserve the existing idempotency (dedupe via the `url` marker + prior recipients).
- `app/api/admin/bookings/send-reminders/route.ts` — refactor to call `sendBookingReminders`; unchanged auth (`withAuth` + `BOOKINGS_MANAGE`) and response shape. Powers a manual "Send now" admin action.
- New `app/api/cron/booking-reminders/route.ts`
  - `POST` (and `GET` for easy testing) guarded by a **`CRON_SECRET`** bearer token, compared in constant time. No user session required.
  - On valid secret: `createServiceRoleClient()` → `sendBookingReminders(svc, { createdBy: <system marker> })`. `createdBy` uses a system/service profile id or null-safe marker (decided in plan; must satisfy `tms_notification.created_by`).
  - Exempt from proxy area-gating if needed (like `/api/notifications`), since it is unauthenticated-by-secret.
- **Scheduling:** Supabase `pg_cron` + `pg_net` migration under `supabase/migrations/`:
  - Ensure `pg_cron` and `pg_net` extensions.
  - A daily job (early evening IST, before the cutoff — e.g. 11:30 UTC ≈ 17:00 IST) issues `net.http_post` to `<APP_URL>/api/cron/booking-reminders` with `Authorization: Bearer <secret>`.
  - Secret sourced from Supabase **Vault**; app base URL stored in the job SQL or a small config table.
- **Env:** `CRON_SECRET` set in Vercel and stored in Supabase Vault.

**Why HTTP, not pure SQL:** audience resolution + fan-out are TypeScript (`dispatchNotification`, `resolveTargeting`). Re-implementing in PL/pgSQL would fork the logic. The HTTP hop reuses the single tested dispatcher. Cron delivery is at-least-once; the endpoint's idempotency makes double-fires safe.

### Phase 3 — Attendance: Onward-only

Writes become onward-only; historical reads stay intact (no destructive migration).

- `lib/boarding/attendance-window.ts`
  - `AttDirection = 'onward'` (drop `'return'`).
  - `AttendanceWindows` becomes a single onward window (or `{ onward: AttendanceWindow }`); `DEFAULT_WINDOWS` onward only.
  - `activeDirection()` returns `'onward' | null`.
  - `isDirectionOpen` unchanged for onward.
- `components/admin/attendance-window-settings.tsx` — remove the Return card; single Onward card; copy updated ("Onward attendance scan window").
- `app/api/admin/attendance-windows/route.ts` — validate/persist onward only; ignore any `return` in the body; keep upsert on `tms_attendance_window` (onward row).
- Scan flow — remove the return path:
  - `app/boarding/attendance/page.tsx`, `components/boarding/scan-dialog.tsx`, `app/api/boarding/attendance-window/route.ts`: no return tab; auto-select onward.
  - `app/api/boarding/scan/route.ts`: reject a request whose `direction === 'return'` (400), only create onward `tms_attendance` rows.
- **Data:** existing `tms_attendance.direction='return'` rows and the `tms_attendance_window` return row are left untouched so historical attendance still renders (e.g. student calendar tooltips). Read paths must remain tolerant of a `'return'` value they no longer produce.

### Phase 4 — Notifications / Security / System made real

- **Notifications tab**
  - Replace fake channel toggles with a persisted **"Automatic booking reminders"** control (on/off + optional send time) that maps to the scheduling settings' `autoNotifyPassengers` (single source of truth — no duplicate flag).
  - Remove Email/SMS/Push toggles, or render them explicitly as "Not available (in-app notifications only)".
  - Add a link/shortcut to the existing Notifications module (compose/broadcast).
  - Persist via the generalized settings API (see below).
- **Security tab**
  - Replace unenforced toggles with real, read-only signals we own: recent admin activity from the Activity Log module, and — if available — recent failed-access events.
  - Show a clear note that authentication (session, 2FA, password policy) is managed by the parent MyJKKN identity provider.
- **System tab**
  - New `GET /api/admin/system-info` (withAuth + a read perm) returns: app version (from `package.json`), environment + region, a live DB health check (lightweight query with latency), and real activity counts (e.g. mutations in the last 24h from the Activity Log).
  - Render real values; remove buttons the app cannot perform (CDN purge, DB optimize, schedule restart, maintenance mode). Keep a genuine "Run health check".
- **Settings API generalization**
  - Extend `/api/admin/settings` to accept a `type` (e.g. `scheduling` | `notifications`) so multiple typed setting blobs share the endpoint (`onConflict:'setting_type'` already keys by type). Default remains `scheduling` for backward compatibility.

## 5. Data model

- **No new tables required** for Phases 1, 3, 4 (reuse `admin_settings`, `tms_attendance_window`, activity-log tables).
- **Phase 2:** a `pg_cron` job row + `pg_net` usage; secret in Vault. Optional tiny config table only if the app URL should live in the DB rather than the job SQL. Migration committed under `supabase/migrations/`.
- `admin_settings` assumed present (the Scheduling tab loads it today); confirm columns `setting_type`, `settings_data` (jsonb), `updated_at`, `updated_by` during implementation.

## 6. Testing

- Verify with **build + vitest**, not `tsc` (chronically red on main; not build-gated).
- Phase 1: unit tests for `cutoffFor(hour)`, `effectiveOpen` with a configured cutoff, and `bookableDates(now, daysAhead)` for the configurable horizon (assert `daysAhead=1` ⇒ tomorrow only; `daysAhead=7`; Sundays inside the range still non-bookable). Update `lib/booking/window.test.ts` and `lib/booking/calendar.test.ts` (they assert exact windows for fixed clocks, so the fixed-weekly-window assertions must be rewritten for the N-day horizon).
- Phase 2: unit test for `sendBookingReminders` (autoNotify off ⇒ 0; message reflects configured cutoff; idempotency path). Cron route: secret-required (401 without, 200 with).
- Phase 3: update `lib/boarding/attendance-window.test.ts` for onward-only `activeDirection`.
- Auth-gated end-to-end flows need the **user's** authenticated browser to smoke-test; headless checks are limited to build + curl probes (307/401).

## 7. Config / environment

- `CRON_SECRET` — Vercel env + Supabase Vault.
- Confirm `pg_cron` and `pg_net` extensions are enabled on the project.
- App base URL reachable from Supabase (production Vercel deployment, region bom1).

## 8. Risks & mitigations

- **Changing a pure booking lib** could shift the student gate unexpectedly → default params preserve current cutoff behavior; tests assert both default (20:00) and configured cases.
- **Horizon change is a behavior change, not just a default** — replacing the variable Mon–Sat weekly window with a fixed `daysAhead=7` means the exact set of bookable days shifts (e.g. on a Monday the old window ended Saturday; N=7 ends next Monday). This is intended (admin now controls it) but must be called out at rollout, and the per-date override note in `[[project_booking_window]]` ("overrides only extend within the current week") becomes "within the `daysAhead` horizon". Seed the setting explicitly (e.g. `bookingDaysAhead=6`) if the office wants to preserve the "this week only" feel.
- **Cron double-fire** → endpoint idempotency (existing) makes it safe.
- **Removing evening attendance** is cross-cutting (scan flow) → keep reads tolerant of legacy `'return'` rows; ship as its own phase with its own smoke test.
- **Settings API hardening** could break the current unauthenticated caller (the Settings page fetch) → the page is already an authenticated admin context via the proxy; verify the perm is granted to the admin roles.
- **`admin_settings` route currently has no auth** — treat the hardening as a security fix, not just cleanup.

## 9. Sequencing

1. Phase 1 (cutoff wiring + settings API hardening) — highest value, fixes the misleading bug.
2. Phase 2 (reminder automation) — depends on Phase 1's `loadSchedulingConfig`.
3. Phase 3 (attendance onward-only) — independent; can run in parallel.
4. Phase 4 (Notifications/Security/System real) — depends on the generalized settings API; Notifications control depends on Phase 2.

## 10. Open questions

None outstanding. Resolved scope decisions:
1. Wire the booking **cutoff hour** into enforcement.
2. Make **"booking days available"** a real setting — a configurable rolling **N-day-ahead** horizon (`bookingDaysAhead`), NOT per-weekday selection.
3. Booking reminders go **only to non-booked** transport learners.
4. **Remove evening marking entirely** from attendance (onward-only).
5. Trigger reminders via **Supabase pg_cron**.
6. Make the decorative **Notifications/Security/System** tabs real where feasible; drop the fakes.

Deferred to the implementation plan (not design ambiguities): exact GET permission on the settings route; the `createdBy` value the cron uses for `tms_notification`; whether `bookingWeekEnd()` is deleted or retained; the default `bookingDaysAhead` seed value the office prefers.
