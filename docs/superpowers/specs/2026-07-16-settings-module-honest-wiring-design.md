# Settings Module — Honest Wiring Rebuild

- **Date:** 2026-07-16
- **Status:** Approved (design) — pending implementation plan
- **Author:** Claude (with Sangeetha V)
- **Permission gate:** existing `tms.settings.manage` (`TMS_PERMISSIONS.SETTINGS_MANAGE`) — no new permission seeding

## 1. Problem / current state (verified)

The admin Settings module is a single 908-line client file (`app/(admin)/settings/page.tsx`)
with six tabs. Only **one** is genuinely functional. Verified against code and the live DB:

| Tab | Storage | Backend reality | Consumed? | Verdict |
|-----|---------|-----------------|-----------|---------|
| General | local `useState` | none (Save → toast only) | no | Cosmetic |
| Scheduling | POST/GET `/api/admin/settings` → `admin_settings` | **table does not exist** (`admin_settings_exists = false`) → 500 | no (booking horizon is `lib/booking/window.ts`) | Broken + ignored |
| Attendance | `/api/admin/attendance-windows` → `tms_attendance_window` | **exists**; modern `withAuth`+`requirePerm`+`logActivity` | yes — boarding scan flow via `loadAttendanceWindows()` | Real, working |
| Notifications | local `useState` | none (Save → toast only) | no | Cosmetic |
| Security | local `useState` | none (Save → toast only) | no | Cosmetic |
| System | hardcoded literals | none; fake metrics + no-op buttons | no | Fake |

Secondary problems:
- **Scheduling is triple-orphaned:** the page hits a dropped table; `lib/scheduling-config.ts`
  (`SchedulingConfigManager`) is a separate **localStorage** manager referencing ~12 fields absent
  from its own interface (dead/broken); its only consumer `components/booking-window-status.tsx`
  is **not mounted** anywhere. The real booking horizon is `lib/booking/window.ts` (weekly window),
  which reads none of it.
- **`/api/admin/settings` is a legacy unprotected service-role route** — no `withAuth`, no
  `requirePerm`, hardcodes `updated_by: 'admin'`. Instance of the authorization gap tracked across
  ~48 routes.
- **Security fields are inapplicable** — auth is Google/Supabase OAuth, so 2FA / password-expiry /
  max-login-attempts have nothing to act on.
- **Notifications toggles are theater** — the live `tms_notification` system has only two real
  channels (in-app inbox + web push via `lib/notifications/push.ts`); there is no email/SMS send
  path and no automated booking/payment/maintenance alert senders. Only push is real, and it is
  already per-user opt-in.
- **System tab misinforms** — claims "Next.js 14.0.3 / Node 18.17.0" (app is on Next 15/16) plus
  invented uptime/session/security-score numbers; every action button is a `toast` no-op.
- The page is **light-theme only** (no `dark:` variants) and hardcodes **blue**, not the app's
  green brand.

## 2. Goals / non-goals

**Goals**
- Every surviving control maps to real, observable behavior (no theater).
- Replace the broken/legacy settings backend with a real, secured, modern-pattern one.
- Remove dead tabs and dead code rather than fake them.
- Bring surviving UI in line with the app (dark mode + green brand, component split).

**Non-goals**
- Full app-wide i18n (so: no language setting).
- Retroactive adoption of a shared formatter across every existing screen (introduce it and adopt
  going forward; be honest in the UI).
- Live infrastructure metrics (uptime, active sessions, memory, security score) — not available.
- Touching the separate orphaned `components/api-settings.tsx` / `/api/admin/api-settings` feature
  without explicit confirmation (it is NOT one of these tabs).

## 3. Confirmed decisions

- **Remove** the **Scheduling**, **Security**, and **Notifications** tabs entirely.
- **Keep Attendance** unchanged (already real; light theme/brand polish only if trivial).
- **Rebuild General** with real persistence + honest fields.
- **Rebuild System** as a real read-only status panel.

Final module = **3 tabs: General, Attendance, System.**

## 4. Architecture

### 4.1 Data model — `tms_app_setting` (new)

Section-scoped JSONB store (extensible without a per-field migration):

```sql
create table public.tms_app_setting (
  section     text primary key,               -- e.g. 'general'
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
alter table public.tms_app_setting enable row level security;
-- No anon/authenticated policies: writes/reads go through the service-role API only.
```

*Alternatives rejected:* singleton typed-column table (rigid — migration per field);
per-key KV table (more rows, loses section grouping). Migration file committed under
`supabase/migrations/` and applied to the live DB via MCP.

### 4.2 API — rewrite `app/api/admin/settings/route.ts`

Replace the legacy handler with the modern secured pattern:
- `withAuth` + `requirePerm('tms.settings.manage')`, `createServiceRoleClient`.
- `GET` → returns the `general` section merged over defaults (defaults if no row).
- `PUT` → validates the body against the `lib/settings/fields.ts` whitelist, upserts the `general`
  row with `updated_by: auth.userId`, calls `logActivity({ module: 'settings', action: 'update' })`.
- Response shape `{ success, data }` / `{ error }`.
- Old GET/POST/PUT that targeted `admin_settings` are deleted.

### 4.3 API — `GET /api/admin/system-status` (new)

`withAuth` + `requirePerm('tms.settings.manage')`. Returns **real** data only:
- `appVersion`, `nextVersion` (from `package.json`), `nodeVersion` (`process.version`),
  `environment` (`VERCEL_ENV` ?? `NODE_ENV`), server time.
- `db`: `{ ok, latencyMs }` from a `select 1` probe (fail-soft on error).

### 4.4 New `lib/settings/`

- `fields.ts` — `GeneralSettings` type, `defaultGeneralSettings`, and a write whitelist/validator
  (pure; unit-tested with vitest).
- `general.ts` — `loadGeneralSettings(svc)` server helper for consumption.

### 4.5 New `lib/format/` (shared, honest formatters)

- `datetime.ts` and `currency.ts` reading the persisted timezone / date-format / currency.
- Consumed **going forward**; existing screens adopt incrementally (stated honestly in the General
  tab helper text).

### 4.6 General tab — field scope

| Field | Behavior |
|-------|----------|
| **System name** | Persisted **and consumed** in the browser `<title>` + admin header |
| ~~Language~~ | **Dropped** (app is not internationalized) |
| **Timezone** | Persisted; consumed by `lib/format/datetime.ts` going forward |
| **Date format** | Persisted; consumed by `lib/format/datetime.ts` going forward |
| **Currency** | Persisted; consumed by `lib/format/currency.ts` going forward |

### 4.7 System tab — content

- Real version/env/DB-health from `GET /api/admin/system-status`.
- **Delete** fabricated performance metrics, storage bars, security score/alerts/failed-logins, and
  **all** no-op action buttons. Read-only status only.

### 4.8 File structure (split the monolith)

`app/(admin)/settings/page.tsx` becomes a thin shell (tab nav + `?tab=` deep-link) that renders:
- `components/settings/general-settings.tsx`
- `components/admin/attendance-window-settings.tsx` (existing, unchanged)
- `components/settings/system-status.tsx`

(Exact component directory to be finalized in the implementation plan, following the module's
existing conventions.)

## 5. Cleanup / deletions

- Delete `lib/scheduling-config.ts` (broken localStorage manager).
- Delete `components/booking-window-status.tsx` (unmounted orphan; sole consumer of the above).
- Remove the Scheduling / Security / Notifications render functions + their `useState` from the page.
- **Open item:** the separate orphaned `components/api-settings.tsx` (1070 lines) + `/api/admin/api-settings`
  (617 lines) — confirm with the user before removing; out of scope by default.

## 6. Non-functional

- **Theme + brand:** proper `dark:` variants; app green brand (not hardcoded blue).
- **Security:** the route rewrite closes an unprotected service-role endpoint (real auth + perm check).
- **Activity log:** settings updates instrumented via `lib/activity/log.ts` (module `settings`).
- **Tests:** vitest unit tests for `lib/settings/fields.ts` validation and `lib/format/*`.

## 7. Verification plan

- Migration applied to live DB (`tms_app_setting` exists); migration file committed.
- `tsc` clean on changed files (ESLint is known-broken in this repo → use `tsc` + route probes).
- Headless route probes: unauth → 401/redirect; shape checks.
- **User-side (cannot be done headless — auth is behind OAuth):** load Settings, edit General, Save,
  reload → values persist; System tab shows real version/DB health; removed tabs are gone.

## 8. Risks

- Consuming `systemName` in the admin header/title adds a cached settings read to the layout — keep it
  cached and fail-soft to the default so a settings read never blocks page render.
- Shared-formatter adoption is incremental; the General tab must not imply instant app-wide effect.
