# JKKN Transport Management System — Full Specification

**Document type:** As-built system specification (reverse-engineered from the live codebase and production database)
**Repository:** `TMS-ADMIN` · branch at time of writing: `feat/attendance-mark-ownership-v2`
**Date:** 2026-08-31
**Status:** Live in production (Vercel, region `bom1` — Mumbai)

> This document describes the system **as it actually exists**, not as originally
> planned. Figures marked *(measured)* were read from the production database on
> 2026-08-31. The repository `README.md` predates this document and is stale in
> several respects (it names Next.js 15 and a "Payments" module that has since
> been removed); where the two disagree, this document is authoritative.

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Actors and portals](#2-actors-and-portals)
3. [Architecture](#3-architecture)
4. [Authentication and authorization](#4-authentication-and-authorization)
5. [Data model](#5-data-model)
6. [Functional specification by module](#6-functional-specification-by-module)
7. [Cross-cutting concerns](#7-cross-cutting-concerns)
8. [Scheduled jobs](#8-scheduled-jobs)
9. [API surface](#9-api-surface)
10. [Non-functional requirements](#10-non-functional-requirements)
11. [Development and verification](#11-development-and-verification)
12. [Known gaps and technical debt](#12-known-gaps-and-technical-debt)
13. [Glossary](#13-glossary)

---

## 1. Purpose and scope

### 1.1 What the system does

The JKKN Transport Management System (TMS) runs the institution's bus operation
end to end: the fleet, the routes it serves, the people who ride it, the money
they owe for it, and the daily record of who actually boarded.

It is a **single Next.js application serving four distinct portals** behind one
authentication gate. It is not four applications, and it is not one application
with a role dropdown — the portals are separated by URL prefix and gated by
distinct permissions at the network edge.

### 1.2 Operating scale *(measured 2026-08-31)*

| Dimension | Live figure |
| --- | --- |
| Active routes | 25 |
| Route stops | 577 |
| Vehicles (fleet) | 35 |
| Drivers (operational records) | 31 |
| Learner profiles in the institution | 7,359 |
| Learners assigned to a transport route | 1,684 |
| Active staff→route in-charge assignments | 144 |
| Daily-travel bookings recorded | 14,590 |
| Attendance marks recorded | 5,747 |
| Transport bills issued (shared billing ledger) | 20,818 |
| Transport-ledger bill rows | 2,833 |
| Transport years defined | 1 (current) |
| Fee structures defined | 5 |
| Stop-wise fee rates priced | 931 |
| Stop-wise fine rates priced | 466 |

### 1.3 What is explicitly out of scope

- **Payment collection.** The system records that a bill is paid; it does not
  take money. Settlement happens in the institution's finance workflow and is
  written back by an administrator ("mark paid").
- **Native mobile applications.** The system ships as an installable PWA. There
  is no native shell; a Capacitor experiment was attempted and reverted.
  Consequence: driver GPS broadcasting is **foreground-only** (§7.3).
- **Timetable / academic scheduling.** Owned by the sibling MyJKKN application.
- **Identity provisioning.** Accounts, roles and permissions are owned by the
  shared JKKN identity plane; TMS consumes them (§4).

---

## 2. Actors and portals

The application is partitioned into four **areas**. Area is derived purely from
the request path (`lib/auth/areas.ts`), and each area is gated by exactly one
permission.

| Area | URL space | Gate permission | Primary actor |
| --- | --- | --- | --- |
| `admin` | `/` (root — `/dashboard`, `/routes`, …) and `/api/admin/*` | `tms.dashboard.view` | Transport head, transport office staff |
| `student` | `/student/*`, `/api/student/*` | `tms.passenger.self.view` | Learner (bus passenger) |
| `driver` | `/driver/*`, `/api/driver/*` | `tms.driver.self.view` | Bus driver |
| `boarding` | `/boarding/*`, `/api/boarding/*` | `tms.attendance.scan` | Bus in-charge (staff who ride and mark attendance) |

**Admin owns the root URL space.** Any path not matching the other three
prefixes resolves to `admin`. This is deliberate — a new admin route is
gated by default rather than open by default.

### 2.1 Actor descriptions

**Transport head / office staff (admin).** Full operational control: routes,
stops, vehicles, drivers, fee structures, bill generation, grievance triage,
notifications, settings, and the activity log. Super admins bypass every
permission check.

**Learner (student portal).** Sees their assigned route and stop, books their
daily seat, views their boarding-pass QR, their attendance history, their fee
position, submits grievances, and watches their bus live. **Subject to a payment
gate** (§4.4) — a learner who is behind is confined to the fees and grievances
pages.

**Bus in-charge (boarding portal).** A staff member who travels on a bus and is
responsible for marking who boarded. In-charge duty is *self-selected* via a
willingness toggle, then assigned by the office. In-charges receive a transport
fee **exemption**. A route may have many in-charges (route 16 has 12); they
share one roster and split the marking between them.

**Driver (driver portal).** Sees their assigned route and its roster, broadcasts
live GPS from their phone during a trip, records boardings, and submits
grievances.

---

## 3. Architecture

### 3.1 Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js **16.2.6** (App Router; `proxy.ts` is Next 16's renamed middleware) |
| Runtime | React 19.2, TypeScript 5, Node ≥ 20.9 |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), CSS-variable theming with dark mode |
| Data layer | Supabase (Postgres + Auth + Realtime + Storage) via `@supabase/ssr` and `@supabase/supabase-js` |
| Client data | TanStack Query v5 |
| Tables | TanStack Table v8 behind a shared `components/ui/data-table.tsx` engine |
| Maps | Leaflet + react-leaflet; OSRM for road geometry; Nominatim for geocoding |
| Charts | Recharts |
| Motion | Framer Motion |
| Toasts | Sonner (plus legacy `react-hot-toast` in older screens) |
| Spreadsheets | SheetJS (`xlsx`) for import, export and templates |
| QR | `qrcode.react` (render), `html5-qrcode` (scan) |
| Push | `web-push` (VAPID) against a hand-rolled `sw.js` |
| Error reporting | JKKN Bug Reporter SDK (`@boobalan_jkkn/bug-reporter-sdk`) |
| Tests | Vitest — **168 test files**, pure-logic focused |
| Hosting | Vercel, `output: 'standalone'`, pinned to region `bom1` |

### 3.2 Code layout

```
proxy.ts                              The auth gate. Runs on every matched request.
app/(admin)/…                         Admin portal pages (root URL space)
app/student/… app/driver/… app/boarding/…   The three self-service portals
app/api/…                             178 route handlers
lib/<domain>/                         Domain logic, deliberately pure where possible
components/                           112 shared components (ui/ + feature components)
supabase/migrations/                  123 SQL migrations — the schema's source of truth
docs/superpowers/{specs,plans,reviews} Per-feature design and implementation records
```

**Design rule visible throughout `lib/`:** business rules are extracted into
**pure, I/O-free modules with unit tests**, and the route handler is reduced to
"gather facts → call the pure function → shape HTTP". Examples:
`lib/booking/window.ts` (booking horizon), `lib/boarding/attendance-window.ts`
(scan windows), `lib/boarding/attendance-ownership.ts` (who may overwrite a
mark), `lib/tracking/trip-state.ts` (live-status vocabulary). Every one of these
takes the clock as an **argument** rather than calling `Date.now()`, which is
what makes the IST boundary conditions deterministically testable.

### 3.3 Request lifecycle

```
Browser
  │
  ▼
proxy.ts ─── strips any client-supplied x-user-* headers (anti-spoofing)
  ├─ public path?                → forward
  ├─ no valid session?           → 401 (API) / redirect to /auth/login (page)
  ├─ profile missing or inactive?→ 403 / /unauthorized
  ├─ lacks the area permission?  → redirect to the user's OWN home area
  ├─ student behind on fees?     → 402 (API) / redirect to /student/fees
  └─ stamps x-user-id / -email / -role / -super / -institution
  │
  ▼
app/api/**/route.ts ── withAuth() reads those headers (zero extra round trips)
  ├─ requirePerm('tms.<entity>.<action>')
  ├─ createServiceRoleClient()   ← bypasses RLS for admin reads/writes
  └─ { success, data, message } | { error }
```

**Performance note.** The proxy fetches the profile row and fires both
authorization RPCs **concurrently** in a single `Promise.all`, and forwards
identity on request headers so `withAuth` never re-runs `getUser()` plus a
`profiles` select. This collapsed 2–3 serial Supabase round trips that were
previously paid on *every* page load and *every* API call.

### 3.4 API response contract

```jsonc
// success
{ "success": true, "data": … , "message": "…" }
// failure
{ "error": "Human-readable reason", "reason": "machine_code" }
```

Status codes in use: `200`, `400` (validation), `401` (unauthenticated),
`402` (**transport fees overdue** — specific to the student gate), `403`
(forbidden), `404`, `409` (conflict / idempotency), `500`.

---

## 4. Authentication and authorization

### 4.1 Identity model

TMS does not own identity. It consumes a **shared JKKN identity plane** living in
the same Postgres database:

- `auth.users` — Supabase Auth
- `profiles` — the canonical person record. **`profiles.id` must equal
  `auth.users.id`.** This is a hard contract; a mismatch presents at login as
  "no_profile".
- `learners_profiles` — student records (7,359)
- `staff` — staff records
- `user_roles` / `custom_roles` — role assignment and the permission catalogue

Permission checks go through shared SECURITY DEFINER functions
`user_has_permission(permission_name)` and `get_user_merged_permissions()`.

Authentication is OAuth via Supabase, handled at `app/auth/callback/route.ts`,
which also performs the same landing-area resolution as the proxy.

### 4.2 Permission catalogue

All TMS keys are namespaced `tms.*` and centralised in
`lib/constants/tms-permissions.ts`. **Never reference a raw permission string.**

Domains: `dashboard`, `routes`, `vehicles`, `drivers`, `schedules`, `bookings`,
`attendance`, `tracking`, `grievances`, `reports`, `settings`, `enrollment`,
`passenger.self`, `driver.self`, `activity`, `transport_years`, `fees`,
`notifications`, `driver_mobiles`, `vacate`.

Two naming traps are load-bearing and documented in the constants file:

- **`tms.tracking.view` does not mean "may watch the fleet."** It is held by the
  `student` role (6,281 users) and means only "may open a tracking screen."
  Fleet-wide access is **`tms.tracking.fleet.view`**. Using the wrong one would
  expose every bus to every student — this matters most in the
  `realtime.messages` RLS policy, where there is no proxy area gate to fall
  back on.
- **`tms.attendance.override` is deliberately separate from
  `tms.attendance.manage`.** All 112 boarding staff hold `manage`; gating the
  override on it would grant it to the exact population it is meant to
  constrain. `override` is pinned to the `transport_head` role.

### 4.3 Area gating and landing

A user who lacks an area's permission is **redirected to their own area's home**
rather than shown a dead-end 403. Resolution: super admin → `/dashboard`;
`student` role → `/student/dashboard`; `driver` role → `/driver/dashboard`;
otherwise `/dashboard`.

Two special cases run only on the *denied* path, never the hot path:

1. A user holding `tms.attendance.scan` but not `tms.dashboard.view` is a
   boarding scanner and is routed to `/boarding/attendance`.
2. A `bus_required` staff member who has not yet decided on in-charge duty is
   routed to `/boarding/in-charge` (the willingness toggle) via the
   `tms_staff_boarding_eligibility` RPC. Without this, such a staffer arriving
   at the bare domain or the installed PWA start URL would resolve to area
   `admin` and never reach the toggle at all.

**Area-gate exemptions.** The shared notification inbox/bell APIs
(`/api/notifications`) and the Bug Reporter relay (`/api/v1/public`) are
cross-portal: every portal calls the same endpoints and each already scopes to
the caller's own rows. They skip the area gate but still require an
authenticated, active user.

### 4.4 The transport-fee payment gate

This is a **paywall enforced at the network edge**, not in the UI.

**Learners.** `tms_student_transport_access(p_profile_id)` (SECURITY DEFINER —
the user-scoped client cannot read the RLS-denied billing tables) decides whether
the learner is behind on transport fees. If `allowed = false`, every student page
redirects to `/student/fees` and every student API returns **HTTP 402** with
`reason: 'fees_overdue'`. Exempt paths: `/student/fees`, `/student/grievances`,
`/api/student/transport-access`, `/api/student/transport-context` — plus sign-out.

Portal access is additionally **fail-closed on a paid Term 1**: never having been
billed does not count as cleared. `isTerm1Paid` (`lib/fees/term1.ts`) requires
the ledger row to be `'generated'` *and* the money row in `billing_student_bills`
to be fully `'paid'`. Partial payment does not clear it.

**Staff.** A symmetric gate for boarding staff is stubbed in `proxy.ts` but
**not implemented**; the seam is marked in the source.

### 4.5 Anti-spoofing

`proxy.ts` deletes all five `x-user-*` headers from every inbound request before
doing anything else, and only re-sets them on the authenticated path.
`withAuth` **fails closed with 401** if `x-user-id` is absent, on the reasoning
that an absent header means the request did not traverse the proxy.

### 4.6 Public paths

Only these bypass authentication:

- Exact: `/auth/login`, `/auth/callback`, `/unauthorized`, `/access-denied`,
  `/api/cron/auto-generate-bills`, `/api/cron/incharge-allocation-reconcile`
- Prefix: `/_next/`, `/api/auth/`, `/favicon`, `/manifest`, `/sw.`, `/icons/`,
  `/offline.html`

> ⚠️ **Cron paths are listed as exact strings, never as a prefix.** A prefix
> entry would un-gate every future cron route by accident, including any that
> removes roles or bills people. `proxy.test.ts` asserts on the source text that
> the prefix form stays absent. Cron routes carry a Bearer `CRON_SECRET` and
> perform their own secret check.

---

## 5. Data model

### 5.1 Ownership boundaries

The Postgres database is **shared across multiple JKKN applications**. Three
distinct planes coexist:

| Plane | Prefix | Owner |
| --- | --- | --- |
| Transport | `tms_*` | This application |
| Billing / money | `billing_*` | Shared finance plane (MyJKKN and TMS both write) |
| Identity | `profiles`, `learners_profiles`, `staff`, `user_roles`, `custom_roles`, `institutions` | Shared identity plane |

**Consequence:** a transport bill exists in two places. `tms_fee_bill` is the
transport **ledger** (why the bill arose, which term, which structure);
`billing_student_bills` is the **money** row the finance plane settles. They are
linked by `tms_fee_bill.billing_student_bill_id`, and the question "did money
move?" must be answered against `billing_student_bills`.

A legacy pre-migration schema (unprefixed `students`, `grievances`, etc. behind a
`DatabaseService` layer) is **dead** — those tables have been dropped and the
code that queries them is unreachable. It is not a pattern to follow. All new
work uses the modern pattern: `withAuth` + service-role client + `tms_` tables.

### 5.2 Core transport entities

**`tms_transport_year`** — the billing/operating year. Exactly one row may be
`is_current`. This flag is load-bearing: with no current year, the fee-access RPC
fails open and learners see "No transport fees assigned".

**`tms_route`** *(25 rows)* — `route_number`, `route_name`, `route_code`,
start/end location and coordinates, `departure_time`, `arrival_time`, `distance`,
`duration` (**TEXT**, not an interval), `total_capacity`, `fare`, `status`,
`driver_id`, `vehicle_id`.

> ⚠️ **`current_passengers` and `total_capacity` are dead columns.** Nothing
> writes them. *(Measured 2026-08-31: `current_passengers` is 0 on all 25 routes;
> `total_capacity` is non-zero on exactly 1.)* Any screen showing "0/0
> passengers" is reading them. Live occupancy must be counted from the roster
> (`lib/passengers/route-roster.ts`).

> ⚠️ **`tms_route` does not contain every numbered bus.** Several route numbers
> were never imported. "Route N is not showing" is usually a **missing row**, not
> a UI bug — check the database first. Also, three distinct routes serve
> EADAPPADI (10, 12, 40); never deduplicate on name.

**`tms_route_stop`** *(577 rows)* — `stop_name`, `stop_time` (morning),
`evening_time`, `sequence_order`, lat/lng, `is_major_stop`, `is_active`.

> ⚠️ **Deleting a stop is unsafe — five distinct FK behaviours fire.** Bookings
> are `NO ACTION` (the delete aborts), fee rates `CASCADE`, and both
> `learners_profiles.transport_stop_id` and `staff.transport_stop_id` are
> `SET NULL`, which **silently unassigns riders**. The safe re-import recipe:
> `UPDATE` survivors in place (spelling variants are renames, not new stops),
> mark dropped stops `is_active = false` with `sequence_order` 90+, and retire
> *before* renumbering. There is no unique constraint on
> `(route_id, sequence_order)`, so collisions do not raise. A cross-route move
> must write **both** `route_id` and `stop_id`. Every newly created stop is
> unpriced until a rate is added.

**`tms_vehicle`** *(35 rows, 55 columns)* — registration, model, capacity, fuel,
status; full compliance tracking (insurance, fitness, permit, pollution, road
tax, first aid, fire extinguisher) with document URLs; ownership and finance
fields; and live GPS columns (`current_latitude/longitude`, `gps_speed`,
`gps_heading`, `last_gps_update`). The fleet is a fixed 35 buses; a "bus details"
spreadsheet import is a **refresh**, never new inventory.

> ⚠️ Recurring spreadsheet-import quirks: registration numbers containing spaces
> create duplicate rows; some policy numbers carry a leading comma; dates arrive
> in three encodings; `vehicle_type = "mazda"` is silently nulled.

**`tms_driver`** *(31 rows)* — an **operational overlay on `staff`**
(`staff_id`, `profile_id`), holding licence, experience, rating, status,
emergency contact, `assigned_route_id`, `active_route_id`, and
`location_sharing_enabled`.

> ⚠️ The driver picker only lists people who already have a `tms_driver` row —
> the usual cause of "can't assign driver". Two admin screens historically wrote
> the driver↔route relationship to *different* columns.

### 5.3 Daily-operations entities

**`tms_booking`** *(14,590 rows)* — `(learner_id, travel_date, route_id, stop_id,
booked_at, booked_by)`. A learner books a **seat for a date**, not a trip
instance.

**`tms_attendance`** *(5,747 rows)* — exactly **one row per
`(learner_id, trip_date, direction)`**. This shared-roster key is a deliberate
invariant: a route's dozen in-charges split the marking and all see one result.
**The key must never gain a staff dimension.** Columns: `status`
(`present`/`absent`), `method`, `scanned_by`, `scanned_at`, `is_walk_up`, plus a
`previous_status` / `previous_scanned_by` / `previous_scanned_at` audit triple
written on override.

**`tms_trip`** *(39 rows)* — a live-tracking session: route, driver, vehicle,
date, direction, `status` (`active` / `completed` / `expired` / `cancelled`),
start and end coordinates, `last_fix_at`, `distance_km`, `fix_count`.

**`tms_service_calendar`** — dated exceptions (holiday / no service), optionally
per route. **Load-bearing for booking:** the booking horizon walks *working*
days, so off-Saturdays must be marked **in advance** or the horizon silently
includes them.

**`tms_attendance_window`** and **`tms_booking_window`** — admin-configurable
time windows, and per-route/per-date booking overrides with capacity override
and deadline.

### 5.4 Fees and fines

| Table | Role |
| --- | --- |
| `tms_fee_structure` *(5)* | `audience` (learner/staff), `fee_mode` (flat or stop-wise), `total_amount`, `split_count`, `institution_ids[]`, `staff_role_keys[]`, `lifecycle_statuses[]`, `auto_generate` |
| `tms_fee_structure_term` | The instalment schedule: term number, label, amount, due date, optional year band |
| `tms_fee_structure_year_band` | Tiering by year of study |
| `tms_fee_structure_stop_rate` *(931)* | Annual amount **per stop**, for stop-wise structures |
| `tms_fee_generation_run` *(322)* | One row per generation sweep |
| `tms_fee_bill` *(2,833)* | The transport ledger row (§5.1) |
| `tms_fee_override` | Per-person term overrides |
| `tms_fee_fine` + `tms_fine_stop_rate` *(466 rates)* | Manual stop-wise fines |

**Bill applicability** (`lib/fees/applicability.ts`) resolves the population a
structure covers: institution (multi-valued; empty means any) and, for learners,
lifecycle status (defaulting to `['active']`) plus admission year for tiering.
Staff additionally filter by role key.

**Fines are a separate ledger from `tms_fee_bill`, on purpose.** A unique
idempotency index forbids repeat fines for the same cause, and the lockout RPC
reads that table specifically.

> ⚠️ **Rate revisions do not reprice existing bills**, and the repricing path
> writes only `billing_student_bills`, leaving `tms_fee_bill` stale. Fix both,
> and be aware that trigger *order* matters on an already-paid bill.

> ⚠️ **Staff bills do not appear in MyJKKN, and that is structural.** Every
> MyJKKN billing table has `student_id NOT NULL` referencing `learners_profiles`,
> and no staff billing table exists anywhere. Do not hunt for a broken sync.

### 5.5 Staffing and in-charge entities

**`tms_staff_route_assignment`** *(144 active)* — `staff_email` (a **raw string**,
not a foreign key), `route_id`, `source`, `is_active`.

> ⚠️ **Staff have three email addresses**: `staff.email` (the *personal* one),
> `staff.institution_email`, and the address on `profiles`. Only 80 of 114
> in-charges resolve via `staff.email` alone. **Always use `resolveStaffId()` in
> `lib/identity/staff-lookup.ts`; never hand-roll the match.** Because the unique
> index compares literals, checking a single address will create duplicate active
> rows — test *every* address when asking "already assigned?". Always **write**
> `lower(profiles.email)`, since both identity authorities read it. And note that
> `profiles.email` is *not* uniformly lowercase while `staff_email` is, so
> `.in('email', lowercased)` silently drops those people; invert the join and
> intersect in memory instead.

**`tms_incharge_roster_allocation`** *(1,417 rows)* — each in-charge's
count-balanced **share** of their bus's roster, so marking duty is divisible.

**`tms_incharge_absence`** — declared absence and cover responses.

**`tms_incharge_attendance_strike` / `_probation` / `_month_verdict`** —
**retired.** In-charge attendance *enforcement* (strikes, probation, monthly
verdicts, removal, punitive billing) was deleted on 2026-08-27. These tables are
retained as read-only history and all related cron jobs are unscheduled. The
**assignment system, the transport fee exemption, and per-share scoring all
survive** and must not be removed as leftovers.

### 5.6 Supporting entities

- `tms_grievance` + `tms_grievance_comment` — polymorphic submitter
  (`submitter_type` + `submitter_profile_id`), so all portals feed one queue
- `tms_notification` + `tms_notification_recipient` + `tms_push_subscription`
- `tms_activity_log` *(9,547 rows)*
- `tms_driver_mobile` — physical phones supplied to drivers
- `tms_transport_vacate_request` *(106)* — retired workflow, read-only history
- `tms_route_optimization` + `tms_route_optimization_item`
- `tms_route_possible_stop` — candidate stops for optimization
- `tms_bug_report_index` — local index of reports filed via the SDK

### 5.7 Database functions

| Function | Security | Purpose |
| --- | --- | --- |
| `tms_student_transport_access(profile_id)` | DEFINER | The learner payment gate (§4.4) |
| `tms_staff_boarding_eligibility(profile_id)` | DEFINER | May this staffer enter boarding / see the toggle? |
| `tms_mark_attendance(marks, date, direction, actor, method, allow_override)` | INVOKER | Atomic multi-mark write with ownership arbitration |
| `tms_can_view_route_live(route_id)` | DEFINER | Realtime RLS — may this user watch this route? |
| `tms_users_with_permission(permission)` | DEFINER | Fail-closed notification audience resolution |
| `tms_expire_stale_trips()` | DEFINER | Closes trips whose GPS went silent |
| `tms_approve_transport_vacate(request_id, approver)` | DEFINER | Retained; its only caller was removed (§6.11) |
| `tms_fee_bill_cleanup_linked_billing()` | DEFINER | Trigger — keeps the two bill planes consistent |

Plus normalisation and `updated_at` triggers for routes, stops, possible stops,
notifications and push subscriptions.

> ⚠️ **`EXECUTE` grants get stripped on this shared database.** The
> `authenticated` grant on `tms_staff_boarding_eligibility` has vanished before
> (Postgres `42501`), and fail-closed code swallowed the error, hiding the
> breakage for weeks. When diagnosing "staff can't log in", check
> `has_function_privilege` **first**. Verify a permission *negative* with
> `SET LOCAL ROLE` inside a `DO` block — a plain `SELECT` as the owner falsely
> succeeds.

> ⚠️ **Execute every new SQL function once before shipping it.** A TypeScript
> parity test proves the SQL and TS *agree*; it does not prove the SQL *parses or
> runs*. `tms_mark_attendance` shipped dead with an ambiguous-column error that
> broke all marking, while its parity test passed throughout. Run the function
> inside a `DO $ … RAISE EXCEPTION` block to exercise and roll back.

---

## 6. Functional specification by module

### 6.1 Dashboard and analytics

**Admin dashboard** (`/dashboard`) — operational overview: fleet status, route
coverage, today's bookings and attendance, outstanding fees, recent activity.
Cached to avoid recomputing aggregates on every load.

**Analytics** (`/analytics`, `tms.reports.view`) — rebuilt on real `tms_` data
after an earlier version was found to be entirely synthetic (`Math.random`).
Transport revenue is defined as bills where `transport_year_id IS NOT NULL`.

**Booking analytics** (`/bookings/analytics`) — forward-looking booking demand
and attendance conversion, sliced by route, stop, institution and date, with CSV
export (`lib/booking/analytics-*.ts`).

### 6.2 Routes and stops

- **List / create / edit / detail** for routes, with per-route sub-views for
  learners, staff and combined passengers.
- **Stops** are managed per route with morning `stop_time` and `evening_time`,
  sequence ordering, coordinates and an active flag.
- **Spreadsheet import** (`/api/admin/routes/import`,
  `lib/routes/parse-route-workbook.ts`) parses the transport office's route
  workbook. **Match on `route_code`, not `route_number`.**
- **Stop search** and **possible stops** support the optimization module.

> The list orders by `created_at DESC`, so a newly seeded route appears at the
> **top**, not the bottom.

### 6.3 Vehicles, drivers and driver mobiles

**Vehicles** — full CRUD, document upload, and Excel import for the 35-bus fleet
refresh. Compliance expiries (insurance, fitness, permit, PUC, road tax) are
first-class fields and surfaced as alerts.

**Drivers** — CRUD over the `tms_driver` overlay, sourced from `staff` via a
staff search endpoint; bulk delete; import; route assignment; and a per-driver
location endpoint.

**Driver Mobiles** (`/driver-mobiles`, `tms.driver_mobiles.*`) — an inventory of
physical phones supplied to drivers, including handover metadata
(`handover_by`, `handover_date`) and handover images stored in a **private**
Supabase Storage bucket accessed via signed URLs.

### 6.4 Schedules and the service calendar

- **Service calendar** — dated holiday / no-service exceptions, global or per
  route. Feeds the booking horizon (§6.5).
- **Booking controls** — per-route, per-date enable/disable, deadline override,
  capacity override (`tms_booking_window`).
- **Route calendar / global calendar / route summaries** — operational views.
- **Trip completion** — manual and automatic (`auto-complete`).
- **Manifest** — the passenger list for a given route and date.

### 6.5 Bookings

**The booking window is the most rule-dense part of the system**
(`lib/booking/window.ts`). India has no DST, so IST is a fixed +05:30 offset and
all arithmetic is deterministic integer math on UTC milliseconds — no timezone
library.

Rules:

- The horizon walks **working days**: starting at tomorrow, it collects the next
  `daysAhead` dates that are **not Sundays**, **not service-calendar off days**,
  and **not already past their cutoff**.
- `daysAhead` defaults to **1**, meaning a travel day is booked on the previous
  *working* day. Friday opens Monday when the Saturday is marked off, so nobody
  has to open the app over a weekend. Admin-configurable 1–10.
- `cutoffHour` defaults to **20:00 IST on the prior day** in code, but a stored
  admin setting beats the code default — the **live cutoff is 19:00**.
  `cutoffHour = 24` disables the daily time window.
- **Same-day booking is opt-in and off by default.** When enabled, today is
  offered *additively*, governed by a separate `sameDayCutoffHour`
  (default 06:00 IST) — the prior-day `cutoffHour` cannot serve here because for
  today it is already in the past.
- A 21-day lookahead cap prevents a long holiday block from looping.

Day states: `not_booked`, `booked`, `locked`, `closed`.

**Admin bookings** (`/bookings`) — list, filter, summary, CSV export, and manual
reminder dispatch.

> ⚠️ **Term-1 gate.** Portal access is fail-closed on a paid Term 1 (§4.4).
> `profile_id` is **not unique** in `learners_profiles`, so an unordered
> `limit 1` in that lookup was a silent gate bypass.

### 6.6 Boarding and attendance

The boarding portal is the in-charge's daily tool.

**Roster.** `/boarding/attendance` shows the route's roster for a date. Rosters
are **3-state**: not marked, present, absent. The date cap has been removed, so
any day's roster is viewable, but **marking is gated** to the travel day and an
open leg window.

**Windows.** Attendance is **onward (morning) only** — the transport office
retired the return leg. This was *not* a data migration: historical rows with
`direction = 'return'` and the stored return window are **retained** and still
render in history views. The default onward window is **07:00–09:30 IST**,
admin-configurable, and `enabled = false` means no time restriction.

**Marking.** A single Present↔Absent toggle, plus QR scanning
(`/boarding/scan`). Writes go through the atomic `tms_mark_attendance` RPC.

**Two gates in series** decide a write:

| Gate | Question | Module |
| --- | --- | --- |
| A — scope | May this actor touch this **learner** at all? | `lib/boarding/mark-scope.ts` (behind `inchargeShareScoringEnabled`) |
| B — arbitration | May this actor overwrite this **row**? | `lib/boarding/attendance-ownership.ts` |

Neither subsumes the other: even when exactly one in-charge owns a learner, a
second writer still reaches the row via a QR scan, a transport-head correction,
an accepted cover, or a mid-day reallocation.

**Ownership rule (Gate B).** The upsert is
`onConflict: 'learner_id,trip_date,direction'` with no database-level guard, so
without this any of a route's twelve in-charges could silently flip a colleague's
mark with no record that the first ever existed. `decideMark` returns one of
`write`, `override` (recording `from` and `previousBy`), `noop`
(already that status), or `deny` (locked). **First mark wins**; overriding
another staffer's mark outside the window requires `tms.attendance.override`.

**Without-ticket travel.** An in-charge can record a rider who boarded without a
booking, via the long-dormant `tms_attendance.is_walk_up` flag. This is
**present-only** (an absent walk-up returns 400). Critically,
`booked === false` is **not** the same as `is_walk_up === true` — roughly a
thousand learners a day are unbooked, while only a handful are actually seen
boarding. `DELETE` of a mark is gated by `canClearMark`.

**In-charge shares.** Each in-charge owns a count-balanced share of the bus
roster (`tms_incharge_roster_allocation`), recomputed by hooks on the assignment
and enrollment APIs plus a reconcile cron. Per-share scoring narrows *credit*
(only your own students count) but equally narrows the *denominator* (your
required days become the days your own students travelled), and measurement
against production showed it bills **fewer** people than the route rule, not
more.

### 6.7 Live tracking

**Sources.** Two, independently:

1. **Driver phone GPS** — the driver broadcasts from `/driver/location` during
   an active `tms_trip`.
2. **Vehicle GPS devices** — hardware trackers, synced via the GPS device module
   and the Mercyda integration.

**Trip lifecycle** (`lib/tracking/trip-state.ts`). Leg is derived from IST
time-of-day against the route's `arrival_time`, with a **120-minute onward
grace** for a late-running morning run and a noon pivot when no arrival time is
recorded. Movement below **0.02 km** is treated as GPS jitter rather than travel.
Live status vocabulary shared by all three UIs: `LIVE`, `CONNECTING`, `STALE`,
`OFFLINE`, `TRIP_COMPLETED`. Stale trips are expired by cron every 5 minutes.

**Distribution.** Private per-route Supabase Realtime channels with RLS on
`realtime.messages`, authorised by `tms_can_view_route_live`. The read path also
enforces expiry, so a stale position cannot be presented as live.

**Maps.** Leaflet basemap, OSRM road-following route geometry, Nominatim
reverse geocoding, campus pin, heading indicator and ETA. `gps_speed` is in
**metres per second** — multiply by 3.6 for km/h.

> ⚠️ Route-**stop** plotting is deliberately deferred: of 479 stops only 14 have
> coordinates, and those are wrong.

**Track All** (`/track-all`) — fleet health across all routes with plain-English
reasons, including exposure of `stuck` sessions.

> ⚠️ **Live tracking is foreground-only.** "The bus froze while the driver's app
> was active" is an expected limitation of a pure-web PWA, not a bug. True
> background tracking requires a native shell.

> ⚠️ **A Google Maps migration is a single forced move, not incremental.**
> Google's terms forbid mixing Google content with Leaflet, so ETA, road geometry
> and basemap must migrate together. The dominant cost driver in that migration
> is per-poll routing, not map tiles. The Navigation SDK is native-only.

### 6.8 Passengers and enrollment

**Learners** (`/passengers/learners`) and **Staff** (`/passengers/staff`) —
searchable, filterable lists with detail pages showing route, stop, fee position
and travel history.

**Enrollment requests** (`/enrollment-requests`,
`tms.enrollment.manage`) — the intake queue for learners requesting transport.

**Staff route assignments** (`/staff-route-assignments`) — single and **bulk**
assignment of in-charges to routes, plus a recommendations endpoint and coverage
reporting (`/api/admin/incharge-coverage`).

**In-charge willingness toggle** (`/boarding/in-charge`) — a `bus_required`
staffer self-declares willingness to serve as in-charge. This replaced an
earlier route picker, which was a privilege hole (staff could assign themselves
to arbitrary routes).

### 6.9 Fees and bill management

**Fee structures** (`/fees`) — create a structure per transport year and
audience, choose flat or stop-wise mode, define terms with due dates, optionally
band by year of study, and scope by institution / lifecycle status / staff role.

**Stop rates** — per-stop annual amounts, with Excel **template download**,
**import**, and a **"copy from fee structure"** action used to price the fine
sheet from the Arts Aided structure.

**Generation** (`lib/fees/generate.ts`) — resolves the applicable population,
resolves each person's terms (including stop schedule and overrides), writes the
`tms_fee_bill` ledger rows and the corresponding `billing_student_bills` money
rows, applies the **in-charge exemption**, counts bills born already overdue, and
notifies staff. Records a `tms_fee_generation_run`. Available both manually
(per structure) and via the automatic sweep (§8).

**Bill management** (`/bill-management`) — bill lists, an unbilled report, an
analytics tab, and mark-paid. `paid_at` is the authority on settlement, **not**
`status`; the mark-paid path writes `paid_at` and leaves `status` as the
historical record of how the bill arose.

**Fines** (`/fees/fine-rates`) — stop-wise fine rates per transport year, with
template, import and copy actions; fines are raised with a preview step and can
be cancelled.

**Per-student overrides** — `tms_fee_override` adjusts a specific person's term.

> ⚠️ **Live blocker.** Mark-paid requires status `'generated'`, but staff bills
> are created as `'staff_deferred'` — so no staff payment is currently
> recordable in either application.

### 6.10 Grievances

`tms_grievance` with a **polymorphic submitter** — all three self-service
portals (`/student/grievances`, `/driver/grievances`, `/boarding/grievances`)
share one UI shape and feed **one admin queue** (`/grievances`).

Admin capabilities: assign, bulk assign, comment/communications, attachments,
resolve, bulk operations, analytics, and separate assignee and assigner
dashboards.

This module is entirely distinct from the dead legacy `grievances` cluster.

### 6.11 Transport vacate — **retired**

**Policy as of 2026-08-24: transport fees are not cancelled once transport has
been availed.** The learner-facing card, the student API, the proxy exemption,
and the approve path (the only caller of `tms_approve_transport_vacate`) have all
been deleted. All 89 pending requests were bulk-closed to `rejected`. The admin
queue is retained **read-only** as history. The RPC still exists but is unreached.

### 6.12 Route optimization

Rebuilt on the `tms_` plane over daily bookings. Three phases:

1. **Analysis** — demand versus capacity per route, using geocoded stops.
2. **Apply / rollback** — vehicle reassignment and passenger transfers, both
   reversible (`tms_route_optimization` + `_item` record the plan and its
   application).
3. **Manual allocation** — an operator override for individual assignments.

### 6.13 Notifications

Own tables (`tms_notification`, `tms_notification_recipient`) plus a **fail-closed
audience resolver** built on `tms_users_with_permission()`. Compose, preview,
target and send; recipients read their own inbox with no additional permission
(own-row RLS). A **4-portal shared inbox** and bell surface the same endpoints
across areas (which is why `/api/notifications` is area-gate-exempt).

Web push is delivered via VAPID (`web-push`) to subscriptions in
`tms_push_subscription`, handled by a hand-rolled `sw.js`.

### 6.14 Settings

A six-tab settings page (`tms.settings.manage`) covering scheduling, attendance
windows, notifications, security, system information, and API settings.

Scheduling config (`lib/settings/scheduling.ts`) is stored as a JSON blob and
normalised on read, with clamping (`cutoffHour` 0–23, `daysAhead` 1–10) and
defaults for missing or wrongly-typed values. Flags:

| Flag | Default | Effect |
| --- | --- | --- |
| `enableBookingTimeWindow` | true | Enforce the daily cutoff |
| `cutoffHour` | 20 (live: 19) | Prior-day booking deadline, IST |
| `daysAhead` | 1 | Working days of booking horizon |
| `allowSameDayBooking` | false | Offer today additively |
| `sameDayCutoffHour` | 6 | Same-day deadline, IST |
| `autoNotifyPassengers` | true | Booking reminders |
| `autoGenerateBills` | false | Master switch for the automatic bill sweep |
| `inchargeShareScoringEnabled` | false | Score and scope in-charges per share rather than per route |

> The booking cutoff was historically a **three-way disconnect** — the setting
> saved, but `window.ts` hardcoded 20:00. A stored value now genuinely wins.

### 6.15 Activity log

`/activity-log` (`tms.activity.view`) — a read-only module. **Every admin
mutation is instrumented** via `lib/activity/log.ts`, capturing actor, module,
action, entity, a human label, a `changes` diff, metadata, IP and user agent.

> ⚠️ The `module` and `action` unions in that file are **closed**. A new module
> must extend them or its routes will not compile — this is intentional, so that
> instrumentation cannot be silently skipped.

### 6.16 Bug reporting

The JKKN Bug Reporter SDK is mounted on all four portals, with an in-app console
at `/bug-reports`.

- The `lucide-react` `overrides` entry in `package.json` is **load-bearing** —
  removing it breaks the build.
- Admin replies route to the reporter's TMS notification inbox (the platform's
  own `/messages` endpoint 500s). **Lowercase the email before targeting.**
- The platform now requires `reporter_email` on both reads and has removed
  app-wide listing, so the console lists from a **local** `tms_bug_report_index`
  that the relay fills at submit time. The relay **forces** `reporter_email` to
  the authenticated user, closing a cross-user read hole.

---

## 7. Cross-cutting concerns

### 7.1 Time and timezone

Everything operational is **IST (+05:30, no DST)**. Date logic is deterministic
integer arithmetic on UTC milliseconds; no timezone library is used. All travel
dates are `'YYYY-MM-DD'` strings. Pure functions take `now: Date` as a parameter
so boundaries are testable.

### 7.2 PWA

One unified installable PWA across all four portals, with a hand-rolled
`sw.js`, a unified manifest, an offline fallback page, and web push (Phase 2).
`start_url` is `/`, which is why the proxy's denied-path landing logic must
handle a `bus_required` staffer arriving at the bare domain.

> ⚠️ **Declaring `metadata.icons` at all disables the `app/icon.png` file
> convention.** Next merges defaults only inside `if (!resolvedMetadata.icons)`,
> so an `icons` block containing only `apple` silently deleted the live favicon.
> When a favicon disappears, look for an `icons` block before hunting a missing
> asset.

### 7.3 Performance

Four rounds of performance work have been completed. Established facts:

- The deployed site is confirmed in `bom1` (Mumbai), co-located with the
  database — **infrastructure latency is resolved.** Any future "everything is
  slow" report is a code or architecture problem, not a region problem.
- Round-4 fixes shipped: dashboard caching, student/driver navigation bundle
  reduction, and elimination of N+1 queries, request waterfalls, and silent
  `.in()` truncation.
- Build-level: `optimizePackageImports` for barrel-heavy packages,
  `removeConsole` in production, WebP/AVIF images, `output: 'standalone'`.
- The documented next lever is an RSC migration.

### 7.4 Query safety

> ⚠️ **PostgREST serialises `.in()` into the request URL.** Roughly 500+ UUIDs
> overflow the Supabase gateway and return HTTP 400, which an unchecked
> `{ data }` turns into a **silently empty result set**. Chunk to ≤150 and
> **check the error**. In the Term-1 gate this failure mode would have locked out
> every learner.
>
> The commonly-cited 1000-row response cap does **not** apply on this project
> (1,952 rows measured in a single response).

### 7.5 UI conventions

- **Lists**: `components/ui/data-table.tsx` (TanStack Table) driven by a
  per-module `columns.tsx` factory — sortable headers, status badges, dropdown
  filters, global search, pagination, row selection, actions menu.
- **Detail pages**: shared `DetailPageHeader` / `SectionCard` / `Field`.
- **Forms**: one shared `<entity>-form.tsx` with `mode='create'|'edit'`, wrapped
  by `new/page.tsx` and `[id]/edit/page.tsx`.
- **Write whitelists**: every module has a `lib/<entity>/fields.ts` mapping the
  fields an API may write.

> ⚠️ **"My edit is not saving" is usually stale UI, not a failed write.** Check
> the row's `updated_at` **before** debugging. `router.refresh()` does not bust
> the TanStack Query cache, and `staleTime: 60_000` hides a successful save.
> Invalidate **derived** keys too.

> ⚠️ **Mobile overflow:** the root element sets `overflow-x-hidden`, which
> *clips* wide children rather than scrolling them. Fix with `min-w-0`,
> `truncate`, `shrink-0` and `flex-wrap`.

> ⚠️ **The `.input` class is unlayered**, so it beats conflicting Tailwind
> utilities. Use `basis-*` or `pl-10!` when overriding.

### 7.6 Security headers

`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and a restrictive
CSP for SVG images (`script-src 'none'; sandbox`).

---

## 8. Scheduled jobs

Two independent schedulers are in play.

**pg&#95;cron (in-database):**

| Job | Schedule | Purpose |
| --- | --- | --- |
| `tms-auto-generate-bills` | every 15 min | Calls `/api/cron/auto-generate-bills`; gated by the `autoGenerateBills` setting |
| `tms-expire-stale-trips` | every 5 min | `tms_expire_stale_trips()` — closes trips whose GPS went silent |

**Vercel cron (`vercel.json`):**

| Path | Schedule (UTC) |
| --- | --- |
| `/api/cron/booking-reminders` | `30 11 * * *` (17:00 IST) |
| `/api/cron/incharge-attendance` | `30 15 * * *` — **dead entry** (§12) |

Cron endpoints authenticate with a Bearer `CRON_SECRET` and are listed as exact
public paths in the proxy (§4.6).

`/api/cron/incharge-allocation-reconcile` exists and is proxy-exempt, but its
schedule migration is **deliberately unapplied** pending deployment. It only
recomputes in-charge share ownership — it moves no money and removes no role —
and acts as a safety net for the recompute hooks on the assignment and
enrollment APIs.

---

## 9. API surface

**178 route handlers.** Namespaces:

| Namespace | Count (approx.) | Notes |
| --- | --- | --- |
| `/api/admin/*` | 129 | The admin portal's backend; `requirePerm` + service role |
| `/api/boarding/*` | 13 | Roster, marking, scan, self-assign, absence, access |
| `/api/student/*` | 10 | Self-service; subject to the 402 fee gate |
| `/api/driver/*` | 8 | Self-service + trip lifecycle |
| `/api/notifications/*` | 4 | Cross-portal, area-gate exempt |
| `/api/cron/*` | 3 | Bearer `CRON_SECRET` |
| `/api/api-management/*` | 4 | Outbound staff/student data APIs |
| `/api/v1/public/[...path]` | 1 | Bug Reporter relay |
| `/api/auth/logout`, `/api/health`, `/api/external-students` | 3 | Misc |

**Standard admin route shape** (`.claude` skill `admin-api-route` encodes this):

```ts
export const GET = withAuth(async (request, auth) => {
  const denied = await requirePerm(auth, TMS_PERMISSIONS.ROUTES_VIEW);
  if (denied) return denied;
  const db = createServiceRoleClient();       // bypasses RLS
  const { data, error } = await db.from('tms_route').select('…');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
});
```

---

## 10. Non-functional requirements

| Requirement | Position |
| --- | --- |
| **Availability** | Vercel serverless; no self-managed infrastructure |
| **Latency** | App and database co-located in Mumbai (`bom1`); auth checks batched into one round trip |
| **Security** | Auth at the edge for every matched request; identity headers stripped and re-stamped; service-role usage confined to server route handlers; fail-closed on missing identity, missing permission, and unresolvable audiences |
| **Auditability** | Every admin mutation written to `tms_activity_log`; attendance overrides carry a `previous_*` triple; bill generation recorded per run |
| **Data integrity** | Idempotency keys on fines and notifications; one-row-per-learner-day attendance invariant; two-plane bill linkage |
| **Accessibility / responsive** | Mobile-first shared shell with a bottom navigation bar; dark mode throughout |
| **Offline** | PWA shell + offline fallback; no offline write queue |
| **Internationalisation** | Not implemented — English, INR, IST only |

---

## 11. Development and verification

### 11.1 Commands

```bash
npm run dev          # Next dev server
npm run build        # Production build — the real gate
npm test             # Vitest (168 test files)
npm run type-check   # tsc --noEmit — informational only, see below
```

### 11.2 What actually verifies a change

- **`npm run build`** — the authoritative check.
- **`npm test`** — pure domain logic is well covered; use it for rules.
- **Browser checks by the user** for anything auth-gated. Automated browsing is
  unauthenticated, so headless verification is limited to type checks and
  status-code probes (307 / 401).

> ⚠️ **Localhost API probes prove very little** — the proxy returns 401 before
> the route is ever reached. Prefer `npm run build` plus a targeted unit test.

> ⚠️ **`npm run lint` is broken** (a circular ESLint config). Verify with a
> path-scoped `tsc` and route probes instead.

> ⚠️ **`tsc` is red on `main` and is not gated by the build**
> (`typescript.ignoreBuildErrors: true`). Roughly 540 chronic errors exist, most
> stemming from an untyped Supabase `Database` type collapsing to `never`. A red
> `tsc` is **not** evidence of a regression.

### 11.3 Migrations

`supabase/migrations/*.sql` is the schema's source of truth (123 files). Even
when a change is applied directly against the database, **commit the `.sql`
file**.

> ⚠️ **Apply the migration before merging the code.** A merge that shipped a new
> RPC without a fallback for either write path 500-ed every mark and scan until
> the migration landed.

---

## 12. Known gaps and technical debt

| # | Item | Impact |
| --- | --- | --- |
| 1 | **Staff bills stuck at `staff_deferred`** while mark-paid requires `generated` | No staff transport payment is recordable in either application |
| 2 | **Dead Vercel cron entry** `/api/cron/incharge-attendance` in `vercel.json` — the route was deleted with in-charge enforcement | A daily scheduled invocation of a non-existent path |
| 3 | **Granular authorization is copy-pasted inline.** *(Measured 2026-08-31: only 55 of 129 `/api/admin` route files call `requirePerm`; the other **74** rely solely on the proxy's `tms.dashboard.view` area gate.)* | Any admin-area user reaches those endpoints regardless of their per-action permissions |
| 4 | **\~29k LOC of unreachable legacy code** querying dropped tables | Navigational noise; deletion was proposed and declined |
| 5 | **\~540 TypeScript errors**, unblocked by `ignoreBuildErrors` | Type safety is not a real gate; the root cause is the untyped `Database` type |
| 6 | **ESLint is non-functional** (circular config) | No lint gate |
| 7 | **Dead route counter columns** (`current_passengers`, `total_capacity`) | Any UI reading them shows 0/0 |
| 8 | **\~602 accounts have a latent `profiles.id ≠ auth.users.id` break** | Presents as "cannot log in / no_profile" |
| 9 | **Route stop coordinates are largely missing (14 of 479) and wrong** | Stop-level map plotting is deferred |
| 10 | **Staff transport-fee gate is stubbed, not implemented** | Boarding staff are not fee-gated |
| 11 | **In-charge share billing hole** — a staffer can avoid their own bill by declaring absence every weekday | Unclosed policy gap |
| 12 | **Live tracking is foreground-only** | Position freezes when the driver's screen sleeps |
| 13 | **Route catalogue is incomplete** — 15 route numbers were never imported | "Route N missing" reports |
| 14 | **26 riders on route 31** still await reassignment after the 2026-08-20 re-import | Stale route/stop assignment |
| 15 | **106 stops and 28 learners remain unpriced** in the fine sheet | Fines cannot be raised for them |
| 16 | **89 vacate-request learners** owe a human-sent notification of the policy reversal | Communication debt |
| 17 | **`README.md` is stale** (Next.js 15, removed Payments module, role list that no longer matches) | Misleading onboarding |

---

## 13. Glossary

| Term | Meaning |
| --- | --- |
| **Area** | One of `admin` / `student` / `driver` / `boarding`; derived from URL path, gated by one permission |
| **Bill (ledger vs money)** | `tms_fee_bill` records *why* a charge exists; `billing_student_bills` records the *money* |
| **Boarding portal** | The in-charge's attendance-marking application |
| **Booking** | A learner's claim on a seat for a specific travel date |
| **Cutoff** | The IST hour on the prior day after which a travel date can no longer be booked |
| **In-charge** | A staff member responsible for marking attendance on a bus; fee-exempt |
| **Leg / direction** | `onward` (morning) or `return` (evening). Attendance is onward-only; buses still run both ways |
| **Mark** | One attendance row for one learner on one date and direction |
| **Override** | Changing a mark another staff member made; requires `tms.attendance.override` |
| **Share** | An in-charge's count-balanced slice of a route's roster |
| **Structure** | A fee definition: audience, mode, amount, terms, scope |
| **Transport year** | The operating and billing year; exactly one is `is_current` |
| **Trip** | A live-tracking session for one route, driver, vehicle, date and direction |
| **Walk-up** | A rider who boarded without a booking (`is_walk_up`); present-only |

---

*Generated from the live codebase and production database on 2026-08-31.
When this document and the code disagree, the code is right — please correct
this document.*
