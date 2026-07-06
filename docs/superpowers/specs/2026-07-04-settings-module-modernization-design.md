# Settings Module — Full Modernization Design

**Date:** 2026-07-04
**Status:** Approved (design) — pending implementation plan
**Skill origin:** brainstorming (from a bug report + module audit)

## Context

The admin Settings module (`app/(admin)/settings/page.tsx`, a 937-line `'use client'`
monolith) shows **"Failed to load settings, using defaults"** on open. Root cause
(confirmed against the live DB): its only wired tab (Scheduling) calls
`GET /api/admin/settings`, which queries the `admin_settings` table — and that table
**does not exist** (`to_regclass('public.admin_settings')` = null; no migration ever
created it). Supabase returns `42P01`; the legacy route returns HTTP 500; the page
toasts the error.

Audit of the six tabs (what's actually used):
- **General** — fake: no-op load, save = `toast.success` only, local state resets on reload.
- **Scheduling** — wired to the missing `admin_settings` table (the bug) AND disconnected:
  the real booking cutoff lives in `lib/booking/window.ts` + `tms_booking_window`, which
  never read these settings.
- **Attendance** — REAL: `AttendanceWindowSettings` → `/api/admin/attendance-windows`,
  read by the boarding scan flow. The only genuinely functional tab.
- **Notifications** — fake toggles; per-user push now lives in the bell/profile (PWA
  Phase 2) and admins broadcast via the `/notifications` module.
- **Security** — fake: session-timeout / max-attempts / password-expiry / 2FA /
  IP-restriction enforced nowhere.
- **System** — 100% fabricated (hardcoded "v2.1.0", "Next.js 14.0.3" [repo is Next 16],
  "1,234 sessions", "99.9% uptime", "94/100 security score"); every button just toasts.

There are also **three disconnected scheduling stores**: `admin_settings` (missing),
`SchedulingConfigManager` (localStorage, `lib/scheduling-config.ts`, half-broken — reads
fields absent from its own interface; consumed only by `components/booking-window-status.tsx`),
and the real `lib/booking/window.ts` + `tms_booking_window`.

The legacy route (`app/api/admin/settings/route.ts`) predates modern conventions: no
`withAuth`, no `requirePerm`, uses the old `supabaseAdmin` from `lib/supabase.ts`, and
502s instead of guarding `42P01`.

## Goal

Modernize the Settings module to the project's standard pattern (`withAuth` +
`requirePerm` + `tms_`-prefixed table + service-role + `42P01` guard + `logActivity`),
make **every tab genuinely real** (no fabricated data), fix the load error, and retire
the disconnected/legacy scheduling stores.

### Non-goals
- i18n / a language switcher (the app has none) — `language` is dropped, not built.
- Enforcing controls with no backing in this stack (2FA, password-expiry, max-login-
  attempts are Supabase/Google concerns; CDN purge / server restart / backups are
  meaningless on Vercel + managed Supabase) — these are **removed**, not faked.

## Decisions

1. **One `tms_setting` table** (section → jsonb), deny-all RLS (service-role only), like
   `tms_transport_year`/`tms_fee_*`. Defaults live in code, not seeded rows.
2. **Replace fake Security/System with real equivalents** (real session-timeout + Activity/
   roles links; real version/health/counts/activity), dropping fantasy controls.
3. **Notifications → real admin defaults** (which automated events fire), read by the
   automated writers.
4. **Scheduling → wire into the real booking engine.** The global default cutoff/days-
   before becomes admin-configurable; `lib/booking/window.ts` STAYS PURE (callers fetch
   the default from settings and pass it in). Per-route `tms_booking_window` overrides
   still win. Retire `SchedulingConfigManager` + `booking-window-status.tsx`.
5. **Security session-timeout is enforced in `proxy.ts`, fail-safe** — any error / missing
   cookie ALLOWS the request (never locks out a valid session).
6. **Phased delivery.** This spec covers the whole vision; implementation ships in two
   plans:
   - **Phase A (spine + the fix):** `tms_setting` + modern API + `lib/settings/` + page
     shell + General, Scheduling, Attendance tabs.
   - **Phase B:** Notifications, Security, System tabs (+ their wiring).

## Design

### 1. Data model — `tms_setting` (new migration, Phase A)
```
tms_setting (
  section     text primary key,   -- 'general' | 'scheduling' | 'notifications' | 'security'
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),  -- tms_set_updated_at trigger (or dedicated)
  updated_by  uuid                                  -- profiles.id, soft ref, no FK
)
```
RLS enabled, NO policies (deny-all for anon/authenticated → all access via the
permission-checked service-role API). Additive + idempotent; applied to the live DB by
the controller. System has no stored data (it's derived/read-only).

### 2. `lib/settings/` (Phase A)
- `defaults.ts` — `SECTION_DEFAULTS` (one typed default object per section) + exported
  TS types. Single source of truth for shapes.
- `fields.ts` — per-section write whitelist + validation; `buildSettingPayload(section, body)`
  returns only allowed, validated keys (rejects unknown / out-of-range).
- `repo.ts` — `getSection(svc, section)` (row merged over defaults; `42P01`/missing →
  defaults), `getAllSections(svc)`, `saveSection(svc, section, data, userId)`.

### 3. API — rewrite `app/api/admin/settings/route.ts` (Phase A)
- `GET` (`requirePerm('tms.settings.view')`): `?section=<name>` → that section merged over
  defaults; no param → all sections. `42P01` guard → defaults, never 500. Shape
  `{ success, data }`.
- `PUT` (`requirePerm('tms.settings.manage')`): `{ section, data }` → validate via
  `fields.ts` → upsert `onConflict: 'section'` → `logActivity({module:'settings', action:'update', ...})`.
- Delete the old scheduling-only `GET/POST/PUT` and the `admin_settings` references.
- New `GET /api/admin/settings/system` (`requirePerm('tms.settings.view')`, Phase B):
  real data — app version (build-time import of `package.json`), DB health (`select 1`
  timing), counts (`profiles`, `tms_vehicle`, `tms_route`, `tms_booking`), latest 5
  `tms_activity_log` rows.

### 4. Page rewrite — `app/(admin)/settings/page.tsx` + `components/settings/` (Phase A shell)
- Lean shell: a `tabs` config array driving the tab bar + a switch that renders one
  component per tab. React Query per tab (load section, save via mutation). `usePermissions`
  gates Save (manage) vs read (view). No fabricated data, no inline 800-line render fns.
- `components/settings/`: `general-tab.tsx`, `scheduling-tab.tsx` (Phase A);
  `notifications-tab.tsx`, `security-tab.tsx`, `system-tab.tsx` (Phase B). Attendance
  reuses the existing `AttendanceWindowSettings`. A small `settings-api.ts` client fetcher.

### 5. Per-tab specifics
- **General** (`tms_setting.general`): `systemName` (rendered in the admin header/title),
  `organizationName`, `supportEmail`, `supportPhone`, `timezone` (display label; booking
  stays IST — documented). Drop `language`/`dateFormat`/`currency`.
- **Scheduling** (`tms_setting.scheduling`): `enableBookingTimeWindow`, `bookingWindowEndHour`,
  `bookingWindowDaysBefore`, `sendReminderHours`, `autoNotifyPassengers`. Wiring:
  `lib/booking/window.ts` gains a `defaultCutoff`/`daysBefore` parameter (default = today's
  hardcoded values so existing tests/behavior are unchanged when omitted); the student
  bookings API + admin fetch `tms_setting.scheduling` and pass it in. `send-reminders`
  reads `sendReminderHours`. Delete `lib/scheduling-config.ts` + `components/booking-window-status.tsx`
  (verify no other consumers first).
- **Attendance**: unchanged — keep the tab pointing at `AttendanceWindowSettings`.
- **Notifications** (`tms_setting.notifications`): `bookingRemindersEnabled`,
  `grievanceUpdatesEnabled`, `enrollmentNotificationsEnabled`, `defaultReminderHours`. The
  automated writers (`send-reminders`, grievance/enrollment `notify*`) check the relevant
  flag (via a `getNotificationDefaults(svc)` helper) before dispatching.
- **Security** (`tms_setting.security`): `sessionTimeoutMinutes` (persisted + enforced).
  Enforcement in `proxy.ts`: a `tms-last-activity` cookie stamped each request; if
  `now - lastActivity > timeout` → redirect to login. FAIL-SAFE: missing/oversized/parse-
  error cookie or any read failure ALLOWS the request. Plus read-only cards: a link to
  `/activity-log` and a super-admin/role summary (count from `user_roles`). Drop the
  fantasy toggles.
- **System**: read-only dashboard from `GET /api/admin/settings/system` — real version,
  DB health badge, real entity counts, recent activity. One real "DB health check" button
  (re-pings). No fake action buttons/metrics.

### 6. Permissions
`tms.settings.view` (read every tab + system) and `tms.settings.manage` (save) — both
already in `TMS_PERMISSIONS` (`SETTINGS_VIEW`/`SETTINGS_MANAGE`). No new keys.

## Files

**Phase A — Create:** `supabase/migrations/<ts>_create_tms_setting.sql`;
`lib/settings/defaults.ts`, `lib/settings/fields.ts`, `lib/settings/repo.ts`;
`components/settings/general-tab.tsx`, `components/settings/scheduling-tab.tsx`,
`components/settings/settings-api.ts`.
**Phase A — Modify:** `app/api/admin/settings/route.ts` (full rewrite),
`app/(admin)/settings/page.tsx` (full rewrite to shell), `lib/booking/window.ts`
(configurable default param) + its callers + its test.
**Phase A — Delete:** `lib/scheduling-config.ts`, `components/booking-window-status.tsx`
(after confirming no other consumers).

**Phase B — Create:** `app/api/admin/settings/system/route.ts`;
`components/settings/notifications-tab.tsx`, `security-tab.tsx`, `system-tab.tsx`.
**Phase B — Modify:** `proxy.ts` (fail-safe session-timeout), the automated writers
(reminders/grievance/enrollment) to honor the notification defaults.

## Verification

- `tsc` on changed files; `vitest` for `lib/settings` (defaults-merge + field validation)
  and the updated `lib/booking/window.ts` tests.
- Dev-server probes: `GET /api/admin/settings` returns **200 with defaults** (not 500)
  even before any row exists; `PUT` returns 200 (manage) / 403 (no perm).
- Manual (user's authenticated Chrome): open Settings → no error toast; each tab loads;
  save persists across reload; Scheduling change alters the booking default; session
  timeout redirects after idle (and never locks out an active session).

## Risks

- **`proxy.ts` session-timeout on the auth hot path** — mitigated by fail-safe design
  (errors allow) + keeping the check to a cheap cookie read.
- **Booking-behavior change** — the default cutoff becomes configurable; existing per-route
  `tms_booking_window` overrides are unaffected, and `window.ts` stays pure (param default
  = current hardcoded values).
- **`package.json` version at runtime** — use a build-time import/constant, not a runtime
  file read.
- **Deleting `scheduling-config.ts`/`booking-window-status.tsx`** — verify no other
  importers first (grep) before removal.
- **Scope** — large; mitigated by the A/B phase split (each phase ships independently).
