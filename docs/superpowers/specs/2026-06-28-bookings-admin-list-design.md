# Rebuild `/bookings` as a modern admin list of `tms_booking`

**Date:** 2026-06-28
**Status:** Approved (design)
**Scope:** Replace the dead legacy admin Bookings page with a modern, read-only,
date-scoped list over the live `tms_booking` table.

---

## 1. Problem

The admin route `app/(admin)/bookings/page.tsx` is a stranded legacy shell:

- Reads `localStorage.getItem('adminUser')` (legacy auth), runs a `Math.random()`
  "live updates" simulation, and renders a domain model that no longer exists
  (`seat_number`, `qr_code`, `amount`, `payment_status`, `status`).
- Its data source `GET /api/admin/bookings` queries `.from('bookings')` — a table
  that has been **dropped** (`to_regclass('public.bookings')` → `null`), so the page
  always falls through to its "Error Loading Data" screen.
- The route uses a raw service-role client with **no `withAuth` and no permission
  check** (an unauthenticated RLS-bypassing endpoint).
- It is **not in `lib/navigation.ts`**, so it is unreachable except by typing the URL.

Meanwhile the real booking data lives in the modern `tms_booking` table
(**561 rows across 24 routes** at time of writing), populated by the student daily
booking flow (`/student/bookings`) and surfaced to admins only in aggregate via the
`/schedules` → "Load & Manifest" tab. There is no record-level admin list.

## 2. Goal

A modern, read-only admin list of individual `tms_booking` rows, matching the
project's MODERN module conventions (`withAuth` + `requirePerm` + service-role API,
shared `DataTable` engine, dark-mode-aware client page, nav entry).

### Non-goals (YAGNI)

- **No mutations.** No cancel-on-behalf, no book-on-behalf. (Read-only chosen.)
  Therefore: no `DELETE`/`POST`, no `lib/booking/...fields.ts` write whitelist, and
  **no activity-log instrumentation** (there are no writes to audit).
- **No per-booking detail page.** A booking is a thin record; the list is sufficient.
- **No DB migration and no permission seeding** — see §7.
- **No server-side pagination/sorting.** Scope by date range; the client `DataTable`
  handles sort/filter/search/paginate, exactly like every other admin module.

## 3. Data model (existing — unchanged)

`tms_booking` (after the 2026-06-23 redesign, "presence = booked"):

| column | type | notes |
|---|---|---|
| `learner_id` | uuid | PK part; FK → `learners_profiles(id)` |
| `travel_date` | date | PK part |
| `route_id` | uuid | snapshot of route at booking time → `tms_route(id)` |
| `stop_id` | uuid \| null | snapshot of boarding stop → `tms_route_stop(id)` |
| `booked_at` | timestamptz | |
| `booked_by` | uuid \| null | learner user id, or an admin's id if booked on behalf |

Composite primary key `(learner_id, travel_date)` — there is **no surrogate `id`**
and **no `status` column** (a cancel is a hard `DELETE`). Row identity for the table
UI is the synthetic key `` `${learner_id}:${travel_date}` ``.

## 4. Architecture & file inventory

| File | Action | Purpose |
|---|---|---|
| `lib/booking/admin-list.ts` | **new** | Pure types + `toBookingRow()` denormalize mapper (unit-tested) |
| `lib/booking/admin-list.test.ts` | **new** | Vitest for the mapper |
| `app/api/admin/bookings/route.ts` | **replace** | Modern `withAuth` + `requirePerm` GET returning denormalized rows |
| `app/(admin)/bookings/columns.tsx` | **new** | `DataTable` column factory for booking rows |
| `app/(admin)/bookings/page.tsx` | **replace** | Modern client page: filters, stats, table, CSV export |
| `lib/navigation.ts` | **edit** | Add the `Bookings` nav item (transport group) |

Unaffected siblings (separate files, not touched): `app/api/admin/bookings/summary/route.ts`,
`app/api/admin/bookings/send-reminders/route.ts`.

## 5. API contract — `GET /api/admin/bookings`

- **Auth:** `withAuth`; `requirePerm(TMS_PERMISSIONS.BOOKINGS_VIEW)` with the
  `auth.isSuperAdmin` bypass (identical shape to `summary/route.ts`). 403 otherwise.
- **Query params:**
  - `from` — `YYYY-MM-DD`, default `istToday()` (from `lib/booking/window.ts`).
  - `to` — `YYYY-MM-DD`, default `addDays(istToday(), 92)` (the booking horizon).
  - `route_id` — optional UUID filter.
  - Invalid/missing date params fall back to defaults (do not 400 on bad dates).
- **Query:** `tms_booking` where `travel_date` ∈ `[from, to]` (+ `route_id` if given),
  `order by travel_date asc, booked_at asc`.
- **Denormalize** (mirrors `schedules/manifest/route.ts`): collect distinct
  `learner_id`/`route_id`/`stop_id`, batch-fetch labels with `.in()` **chunked to ≤150
  ids per call** (per the large-`.in()` gateway-limit rule), build maps, then map each
  booking through `toBookingRow()`.
  - `learners_profiles` → `id, first_name, last_name, roll_number, profile_id`
  - `tms_route` → `id, route_number, route_name`
  - `tms_route_stop` → `id, stop_name`
- **Response:** `{ success: true, data: { from, to, rows: BookingListRow[] } }`.
- **Guards:** `42P01` (missing table) → `{ success: true, data: { from, to, rows: [] } }`.
  Other errors → `500 { error }` with a `console.error`.

### Types (`lib/booking/admin-list.ts`)

```ts
export interface BookingListRow {
  key: string;            // `${learner_id}:${travel_date}`
  learner_id: string;
  learner_name: string;   // "First Last" || '—'
  roll_number: string | null;
  travel_date: string;    // 'YYYY-MM-DD'
  route_id: string;
  route_label: string;    // "05 · Sankari" || route_id
  stop_id: string | null;
  stop_name: string | null;
  booked_at: string;      // ISO
  booked_by: string | null;
  booked_by_label: 'Self' | 'Admin' | '—'; // booked_by === learner.profile_id ? Self : booked_by ? Admin : —
}
```

`toBookingRow(booking, { learners, routes, stops })` is **pure** (takes plain Maps,
no Supabase client) so it is unit-tested without a DB — following the existing
`lib/booking/window.ts` / `month.ts` pure-helper idiom.

## 6. UI

### Columns — `app/(admin)/bookings/columns.tsx` (advanced-data-table pattern)

- **Travel Date** (sortable) + a derived status badge: `Today` / `Upcoming` / `Past`
  computed against `istToday()`. Since "presence = booked", this badge is the
  at-a-glance signal that replaces the old (now-meaningless) `status` column.
- **Learner** — name + roll number (plain text; no link, to avoid a broken route).
- **Route** — `route_label`.
- **Stop** — `stop_name ?? '—'`.
- **Booked At** — localized date-time (IST).
- **Booked By** — `booked_by_label`.
- Global search across learner name / roll / route label; a route dropdown filter.

### Page — `app/(admin)/bookings/page.tsx`

- `'use client'`, React Query; dark-mode-aware shell consistent with `/schedules`.
- Controls: a **date-range picker** (`from`/`to`, default upcoming) and a **route
  filter**, both feeding the React Query key so changes refetch.
- Four stat cards derived client-side from the returned rows: **bookings in range**,
  **distinct learners**, **distinct routes**, **today's bookings**.
- `<DataTable>` with the columns above.
- **CSV export** of the currently filtered rows (Travel Date, Learner, Roll, Route,
  Stop, Booked At, Booked By) — client-side Blob download, like the legacy page.
- Modern loading / error / empty states (no `localStorage`, no `Math.random`).

## 7. Permissions (no change required)

`tms.bookings.view` already exists in `lib/constants/tms-permissions.ts` and is granted
in the DB to the **`transport_head`** role (verified: it is the only role with
`tms.bookings.view`, and it also holds `tms.schedules.view` / `tms.bookings.manage`).
`super_admin` is covered by the `auth.isSuperAdmin` bypass in both the route and the
nav filter. So the new nav item and API gate behave **exactly like `/schedules`** with
no migration and no `custom_roles` seeding.

## 8. Testing & verification

- **Unit:** `lib/booking/admin-list.test.ts` covers `toBookingRow()` — name fallback,
  missing stop, and the `Self`/`Admin`/`—` `booked_by_label` branches.
- **Type:** `tsc --noEmit` filtered to the changed files (ESLint is broken in this repo).
- **Route probes:** dev-server hits on `/api/admin/bookings` (expect 307/401
  unauthenticated, per the auth-verification constraint — the agent's browser is
  unauthenticated, so full render verification is the user's, in their browser).

## 9. Risks / notes

- **Growth:** date-range scoping keeps the payload bounded; an unscoped "all history"
  load is intentionally not offered.
- **`booked_by` heuristic:** `Self` vs `Admin` is inferred by comparing `booked_by` to
  the learner's `profile_id`. Since there is currently no admin book-on-behalf path,
  all live rows should read `Self` (or `—` for seeded rows with null `booked_by`).
- **Parallel sessions** commit to `main` mid-task — verify `HEAD` before committing and
  never use `git add -A` / `stash`.
