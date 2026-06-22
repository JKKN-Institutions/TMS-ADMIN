# TMS Passenger → Admin: Deep Analysis & Unified-Codebase Integration Plan

> Source analysed: `https://github.com/JKKN-Institutions/TMS-PASSENGER-NEW`
> Target: existing `TMS-ADMIN` (this repo). Date: 2026-06-09.
> Goal: one Next.js app that serves **Admin**, **Learner/Passenger**, and **Driver** dashboards with proper role-based access on a single, clean, scalable architecture.

---

## 0. Executive summary (read this first)

Two database probes against the live project (`kvizhngldtiuufknvehv`) collapsed almost all the uncertainty:

1. **The Passenger app's data layer is pointed at tables that no longer exist here.** It reads/writes `students`, `drivers`, `vehicles`, `routes`, `schedules`, `bookings`, `route_stops`, `grievances`, `semester_payments`, `attendance`, `transport_enrollment_requests`, … — **none of which exist** in the current DB. The DB only has the modern `tms_*` set (`tms_driver`, `tms_vehicle`, `tms_route`, `tms_route_stop`, `tms_route_possible_stop`), the MyJKKN-owned `learners_profiles` / `staff`, and the auth tables (`profiles`, `custom_roles`, `user_roles`).
2. **Learners and drivers already have Supabase identities.** `profiles` contains **4,969 `student`** rows and **35 `driver`** rows next to the admin roles. They can authenticate through the *same* `proxy.ts` + `@supabase/ssr` + `user_has_permission()` pipeline the Admin uses today.
3. **The permission catalog already anticipates passengers.** `lib/constants/tms-permissions.ts` already defines `BOOKINGS_CREATE`, `ATTENDANCE_SCAN`, `TRACKING_SHARE`, `GRIEVANCES_SUBMIT`, etc.

**Therefore the integration is a RE-PLATFORM, not a code merge.** Treat the Passenger repo as a **feature specification + a donor of a few self-contained components** (QR scanner, live map, receipts, payment UI), and rebuild its features on the Admin's architecture (Supabase SSR auth, `proxy.ts`, `withAuth` + `requirePerm`, `tms_*` tables + RLS, shadcn/Radix UI, the modern module file pattern).

**Do NOT port** the Passenger app's auth system (custom MyJKKN-token + `localStorage` + `bcrypt` + mock JWT validation), its data-access layer (`lib/supabase.ts` god-module + ~104 IDOR-prone service-role routes), its non-Radix `components/ui/*`, or any of its debug/test/backdoor routes.

**Recommended shape:** a single Next.js 16 app with new URL-prefixed areas — `/portal/*` (Learner), `/driver/*` (Driver), optional `/boarding/*` (attendance scanner) — alongside the existing root Admin URLs, each with its own layout shell, all gated by a role-aware `proxy.ts`.

---

## PART 1 — Passenger application: what it actually is

### 1.1 Tech stack (and where it diverges from Admin)

| Concern | TMS-PASSENGER-NEW | TMS-ADMIN (target) | Implication |
|---|---|---|---|
| Next.js | 15.3.4 (`middleware.ts`) | 16.2.6 (`proxy.ts`) | Ported code must be upgraded (async `cookies()`/`headers()`, middleware→proxy). |
| Auth | Custom OAuth client of MyJKKN `auth.jkkn.ai`; tokens in `js-cookie`+`localStorage`; `bcrypt` fallback; **mock** server validation | `@supabase/ssr` cookie sessions + Google OAuth (PKCE) + `proxy.ts` + permission RPCs | **Biggest divergence.** Discard Passenger auth entirely. |
| Supabase | `@supabase/supabase-js` only; **no `@supabase/ssr`**, no Supabase Auth, RLS bypassed via service-role on ~56 routes | `@supabase/ssr` server/browser/service clients; RLS-aware | Re-plumb every data path. |
| Tables | **unprefixed** (`students`, `drivers`, …) — don't exist here | `tms_*` + `learners_profiles`/`staff` | Re-map all entities; build missing tables. |
| Payments | **Razorpay** (`razorpay`, `semester_payments`) | none | Net-new capability — port the gateway, rebuild securely. |
| QR | `html5-qrcode` (scan) + `qrcode.react` (generate) | none | Port — self-contained, high value. |
| Push | `web-push` (VAPID) + `push_subscriptions` | `push_subscriptions` table exists; admin has `/notifications/push` | Consolidate on one push service. |
| Maps | **vanilla `leaflet`** (imperative) | `react-leaflet` (`track-all`, `gps-devices`) | Reuse Admin's map stack; passenger = consumer view. |
| UI kit | Hand-rolled non-Radix `components/ui/*`; 3 conflicting brand greens; `react-hot-toast` | Real shadcn + Radix; OKLCH theme; `react-hot-toast` (dominant) | Use Admin's UI kit; drop Passenger primitives. |
| i18n | EN/Tamil context (`lib/i18n`) | none | Optional to adopt. |
| Tests | Jest + Playwright + MSW | none | Optional to adopt for the new modules. |

### 1.2 Personas & modules

The Passenger app serves **three personas by URL prefix** (no route groups, each with its own `layout.tsx` + client guard):

- **Passenger / Learner** → `app/dashboard/*`
- **Driver** → `app/driver/*`
- **Staff (boarding/attendance supervisor)** → `app/staff/*`

**56 page routes, 104 API handlers.** Module map:

| Module | Learner routes | Driver routes | Staff routes | Backing data (passenger names) |
|---|---|---|---|---|
| Dashboard / home | `/dashboard` | `/driver` | `/staff` | students, routes, semester_payments |
| Routes & stops | `/dashboard/routes` | `/driver/routes`, `/driver/routes/[id]` | `/staff/routes`, `/staff/assigned-routes` | routes, route_stops, student_route_allocations |
| Schedules & bookings | `/dashboard/schedules` | `/driver/bookings` | `/staff/bookings` | schedules, bookings (+ QR ticket) |
| Live tracking / location | `/dashboard/live-track`, `/dashboard/location` | `/driver/live-tracking`, `/driver/location` | — | location_tracking |
| Payments | `/dashboard/payments` | — | — | semester_payments, semester_fees, payment_receipts |
| Grievances | `/dashboard/grievances` | — | `/staff/grievances` | grievances (+ communications/activity/assignments) |
| Attendance | — | — | `/staff/attendance`, `/staff/attendance-manage` | attendance (QR scan + bulk) |
| Passengers / students | — | `/driver/passengers` | `/staff/students` | bookings, students |
| Notifications | `/dashboard/notifications` | — | — | notifications, push_subscriptions |
| Enrollment | (banner/flow in dashboard) | — | — | transport_enrollment_requests |
| Profile / settings | `/dashboard/profile`, `/dashboard/settings` | `/driver/profile` | `/staff/profile` | students/drivers/staff |
| Reports | — | — | `/staff/reports` | — |
| Bug reports | `/dashboard/my-bug-reports` | `/driver/my-bug-reports` | `/staff/my-bug-reports` | bug_reports (external SDK) |
| Ticket verify | — | — | `TicketScanner` FAB | bookings, attendance (RPC `validate_ticket`) |

### 1.3 Core user journeys (the workflows to preserve)

**Learner happy path**
1. Log in (MyJKKN OAuth today) → land on `/dashboard`.
2. If not transport-enrolled → **enrollment request** (pick route + stop) → admin approves → `student_route_allocations` row created → nav unlocks (route/schedule items are enrollment-gated with a 🔒).
3. **Pay** semester/term transport fee (Razorpay) → `semester_payments` marked paid → receipt downloadable.
4. **Book** a trip for a date on the allocated route → booking row + **QR ticket** (`QRCodeSVG`).
5. **Board**: staff scans the QR (`html5-qrcode`) → `attendance` marked present.
6. **Live-track** the bus on a Leaflet map; receive **push reminders** (booking window, 5 PM daily scheduler).
7. **Raise grievances** with threaded chat; view notifications; edit profile/settings.

**Driver path:** log in → see assigned routes/stops (bilingual EN/Tamil) → toggle **GPS location sharing** (broadcasts `location_tracking` pings) → view today's passenger roster & bookings per route/date.

**Staff/boarding path:** log in → assigned routes → mark **attendance** (QR or bulk present/absent) → verify tickets via FAB scanner → manage grievances → run reports.

### 1.4 API surface (104 handlers) — the security reality

- **No central gate.** Unlike Admin's `proxy.ts`, there is no middleware on `/api/**`. Each route is on its own.
- **Mass IDOR.** ~56 routes use the **service-role key (RLS off)** yet identify the caller from an **unauthenticated `studentId`/`driverId`/`staffId`/`email` query or body param**. Any caller can read/mutate anyone's data (`student/profile` PUT, `driver/profile/update`, `semester-payments`, `grievances`, `staff/passengers`, all `location/tracking/*`).
- **`/api/auth/validate` is a mock** — it accepts hardcoded mock tokens, self-minted base64 `tms_` tokens, and **decodes parent-app JWTs without verifying the signature**. Permissions are hardcoded per role.
- **Hardcoded secrets & a backdoor in source**: parent `api_key`/`app_id` literals; `auth/oauth-workaround` returns a fully-authenticated mock **driver** session for a specific email with no credentials.
- **Fake/loose payments**: `payments/process-dummy` writes "paid" with no gateway; `DEMO_MODE` bypasses Razorpay; webhook signature only checked in production.
- **Live debug/setup routes**: `setup-demo`, `payments/test-keys`/`config-check`, `debug/*`, `test-*`.

> **None of this ships.** The re-platform replaces all of it with `withAuth` + `requirePerm` + **session-derived identity** + RLS. This is a security *upgrade*, not a port.

### 1.5 External integrations to reconcile

| Integration | Env / detail | Disposition in unified app |
|---|---|---|
| MyJKKN OAuth (`auth.jkkn.ai`, `my.jkkn.ac.in`) | `NEXT_PUBLIC_AUTH_SERVER_URL`, `NEXT_PUBLIC_APP_ID`, `API_KEY` (hardcoded default) | **Drop.** Admin already federates MyJKKN identity via Supabase Auth; learners/drivers have `profiles`. |
| Razorpay | `RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET` | **Port** `lib/razorpay.ts`; rebuild routes with server-side amount calc + always-on webhook signature verify. |
| Web Push (VAPID) | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | **Consolidate** with Admin's `/notifications/push` + existing `push_subscriptions` table. |
| Scheduler cron | `SCHEDULER_SECRET_KEY` | Re-implement as a protected route / Supabase cron for booking reminders. |
| Bug reporter SDK | external service | Optional; Admin has its own `bug-management`. |

---

## PART 2 — Architecture comparison (side by side)

| Dimension | Passenger | Admin | Unified target |
|---|---|---|---|
| Identity provider | MyJKKN OAuth tokens (client-held) | MyJKKN → **Supabase Auth** (Google/PKCE), cookie session | Supabase Auth (single source of truth) |
| Route gate | `middleware.ts` cookie-presence only; real guard client-side | `proxy.ts`: `getUser()` + `profiles` + `user_has_permission('tms.dashboard.view')` | **Role-aware `proxy.ts`** routing to area by role + per-area permission |
| API auth | none / param-trust + service-role | `withAuth(handler)` → `AuthContext`, per-route `requirePerm`, service-role for data | Same `withAuth` pattern, extended with **self-scoping** for learner/driver |
| Authorization | hardcoded role literals | `tms.<area>.<action>` keys in `custom_roles.permissions` (jsonb), RPC-checked | Extend catalog with `tms.passenger.*` / `tms.driver.*` / `tms.boarding.*` |
| Data access | `lib/supabase.ts` god-module (anon) + inline service-role | `createServiceRoleClient()` after permission check; `lib/<module>/{types,refs}.ts` | Modern module pattern + **RLS as backstop** on learner-owned tables |
| Tables | unprefixed (absent here) | `tms_*` + MyJKKN masters | New `tms_*` transactional tables, keyed on `learners_profiles` |
| UI | non-Radix, 3 greens, mobile-first | shadcn+Radix, OKLCH theme, desktop-first DataTable | Admin kit + a mobile-first shell for `/portal` & `/driver` |
| Client data | inline fetch in pages/services | TanStack Query + DataTable | TanStack Query everywhere |

**One unifying truth that makes this tractable:** both apps are children of the **same MyJKKN identity domain**. The Admin simply consumes it the right way (through Supabase Auth). So "unifying auth" is not a merge of two systems — it is **deleting the Passenger's parallel system** and letting learners/drivers ride the Admin's existing pipeline.

---

## PART 3 — Recommended integration strategy

### 3.1 Decision: single app, re-platform (chosen)

| Option | Verdict |
|---|---|
| **A. Single Next app, re-platform features onto Admin architecture** | ✅ **Recommended.** Matches "unified app + proper RBAC + clean architecture." Leverages existing auth, permissions, UI, tooling. |
| B. Monorepo (Turborepo), two apps + shared packages | ❌ Keeps two auth systems & two deploys; contradicts "single unified application"; highest long-term tax. |
| C. Co-locate Passenger pages as-is, only unify auth | ❌ The data layer can't survive (tables absent) and the UI kit conflicts; "as-is" buys nothing. |

### 3.2 Target folder structure (single app, URL-prefixed areas)

Route groups with parentheses are URL-invisible and would collide (two `/dashboard`). Use **real prefix folders** for the new areas so `proxy.ts` can gate by path and each area gets its own shell:

```
app/
  (admin)/                      # EXISTING — admin URLs stay at root (/dashboard, /vehicles, …)
    layout.tsx                  # desktop sidebar shell
    ...
  portal/                       # NEW — Learner area (mobile-first). URLs: /portal/*
    layout.tsx                  # learner shell: collapsible sidebar + mobile bottom nav
    dashboard/page.tsx          # enrollment + payment status + quick stats
    routes/page.tsx             # my allocated route + stops (tms_route/tms_route_stop)
    schedules/page.tsx          # view schedules + book + QR ticket
    bookings/page.tsx           # my bookings history
    payments/page.tsx           # semester fee pay (Razorpay) + receipts
    grievances/page.tsx         # submit + track + chat
    notifications/page.tsx      # inbox + push settings
    live-track/page.tsx         # consumer map view
    enrollment/page.tsx         # request transport enrollment
    profile/page.tsx
    settings/page.tsx
  driver/                       # NEW — Driver area (mobile-first). URLs: /driver/*
    layout.tsx
    dashboard/  routes/  live-tracking/  passengers/  bookings/  profile/
  boarding/                     # OPTIONAL (Phase later) — attendance scanner area. URLs: /boarding/*
    layout.tsx
    attendance/  scan/  assigned-routes/
  api/
    admin/                      # EXISTING admin APIs (withAuth + requirePerm)
    portal/                     # NEW learner self-service APIs (withAuth + self-scoping)
      me/route.ts               # resolves caller → learners_profiles row
      routes/  schedules/  bookings/  payments/  grievances/  enrollment/  notifications/
    driver/                     # NEW driver APIs (withAuth + driver self-scoping)
      me/  routes/  passengers/  location/
    boarding/                   # NEW scanner APIs (withAuth + tms.attendance.scan)
      scan-ticket/  mark-attendance/
  auth/                         # EXISTING (login, callback) — unchanged
lib/
  portal/   { types.ts, refs.ts }     # SELECT lists, Row DTOs, pure mappers (per modern pattern)
  driver/   { types.ts, refs.ts }
  payments/ { razorpay.ts, fees.ts }  # ported gateway + server-side fee calc
  qr/       { ticket.ts }             # QR generate/verify helpers
  api/with-auth.ts                    # EXISTING — extend with withSelfScope helper
  constants/tms-permissions.ts        # EXISTING — extend
components/
  ui/                           # EXISTING shadcn/Radix — reused as-is
  portal/                       # learner shell, bottom-nav, FAB, enrollment banner
  driver/                       # driver shell, location toggle
  shared/
    qr-scanner.tsx              # ported from app/staff/components/TicketScanner.tsx
    qr-ticket.tsx               # QRCodeSVG wrapper
    live-map.tsx                # react-leaflet consumer map (reuse track-all)
    receipt.tsx                 # ported invoice/receipt
    payment-dialog.tsx          # Razorpay checkout UI
```

**Why `/portal` (not `/dashboard`):** the Admin already owns `/dashboard`; a distinct prefix avoids collisions and lets the proxy cleanly say "`/portal/*` requires a learner permission; `/(admin) root` requires an admin permission." (`/me`, `/student`, or `/p` are acceptable alternatives — pick one and standardise.)

### 3.3 Unified auth & role-based routing

`proxy.ts` today validates the session, loads `profiles`, and requires `tms.dashboard.view` for everyone. **Generalise it** to route each role to its area and gate accordingly:

```ts
// proxy.ts (sketch — replaces the single tms.dashboard.view gate)
const area = resolveArea(pathname);             // 'admin' | 'portal' | 'driver' | 'boarding'
const role = profile.role;                      // from profiles
// 1) area access matrix (super_admin bypasses all)
const ok =
  profile.is_super_admin ||
  (area === 'portal'   && await can('tms.passenger.self.view')) ||
  (area === 'driver'   && await can('tms.tracking.share'))     ||  // or tms.driver.self.view
  (area === 'boarding' && await can('tms.attendance.scan'))    ||
  (area === 'admin'    && await can('tms.dashboard.view'));
if (!ok) return redirectToHomeArea(role);       // student→/portal, driver→/driver, else /unauthorized
// 2) home redirect: a bare student hitting /dashboard is bounced to /portal/dashboard
```

- **Login is unchanged** (`/auth/login` Google/MyJKKN→Supabase). After callback, redirect by role: `student → /portal/dashboard`, `driver → /driver/dashboard`, admin roles → `/dashboard`.
- **Self-scoping (the IDOR fix).** Learner/driver APIs never accept a `studentId`/`driverId` param. Add a helper:

```ts
// lib/api/with-auth.ts (new)
export async function getLearnerForUser(auth: AuthContext) {
  const svc = createServiceRoleClient();
  // link profiles → learners_profiles (by email today; add learner_profile_id to profiles for a hard FK)
  const { data: prof } = await auth.supabase.from('profiles')
    .select('email').eq('id', auth.userId).single();
  return svc.from('learners_profiles')
    .select('id, roll_number, transport_route_id, transport_stop_id, bus_required, transport_fee')
    .eq('student_email', prof.email).single();
}
// every /api/portal/* handler starts from this row — caller can only touch their own data.
```

> **Schema note:** `learners_profiles` exposes `student_email`/`college_email`/`roll_number` but no `user_id`. The cleanest long-term fix is to add `learners_profiles.profile_id uuid REFERENCES profiles(id)` (or `auth_user_id`) so the join is a hard FK, not an email match. Same idea for drivers: `tms_driver` should carry a `profile_id`.

### 3.4 RBAC consolidation

Extend `lib/constants/tms-permissions.ts` with self-service keys and seed them onto the `student`/`driver` roles in `custom_roles.permissions` (one update covers all 4,969 learners since they share the role):

```ts
// additions to TMS_PERMISSIONS
PASSENGER_SELF_VIEW:   'tms.passenger.self.view',     // see own dashboard/profile/routes
PASSENGER_BOOK:        'tms.passenger.booking.create', // (or reuse BOOKINGS_CREATE)
PASSENGER_PAY:         'tms.passenger.payment.pay',
PASSENGER_ENROLL:      'tms.passenger.enrollment.request',
DRIVER_SELF_VIEW:      'tms.driver.self.view',
DRIVER_LOCATION_SHARE: 'tms.tracking.share',           // already exists
BOARDING_SCAN:         'tms.attendance.scan',           // already exists
```

Migration `supabase/migrations/<ts>_seed_passenger_permission_keys.sql`: add keys to the catalog and append them to the `student`/`driver` system roles' `permissions` jsonb. This mirrors the existing `*_add_tms_permission_keys.sql` migrations.

---

## PART 4 — Database plan (the heavy lift)

The transactional transport domain has **no tables yet** — they must be designed and created as `tms_*` tables, modelled on the Passenger schema but prefixed, FK'd to `learners_profiles`/`tms_route`/`tms_driver`, and **RLS-governed**.

### 4.1 Tables to CREATE

| New table | Models passenger's | Key columns / FKs | RLS intent |
|---|---|---|---|
| `tms_schedule` | `schedules` | `route_id→tms_route`, `schedule_date`, `departure/arrival_time`, `available_seats`, `booked_seats`, `booking_enabled`, `driver_id→tms_driver`, `vehicle_id→tms_vehicle`, `status` | read: enrolled learners + staff; write: admin |
| `tms_booking` | `bookings` | `learner_id→learners_profiles`, `route_id`, `schedule_id→tms_schedule`, `trip_date`, `boarding_stop_id→tms_route_stop`, `seat_number`, `status`, `payment_status`, `qr_code`, `booking_reference` (unique) | learner sees/creates own; staff/driver read by route |
| `tms_attendance` | `attendance` | `booking_id→tms_booking`, `learner_id`, `route_id`, `schedule_id`, `trip_date`, `status`, `method`, `scanned_by`, `boarding_time` | learner read own; staff scan/write |
| `tms_semester_payment` | `semester_payments` | `learner_id`, `route_id`, `academic_year`, `semester`, `amount`, `status`, `payment_type`, `gateway_order_id`, `gateway_payment_id`, `receipt_number`, `valid_from/until` | learner read/initiate own; admin read all |
| `tms_fee_structure` | `semester_fees` | `route_id`/`stop_id`/`semester`/`academic_year` → `amount` | read: authenticated; write: admin. (Or derive from `learners_profiles.transport_fee`.) |
| `tms_grievance` | `grievances` | `learner_id`, `route_id`, `category`, `priority`, `subject`, `description`, `status`, `assigned_to→profiles`, `resolution` | learner own; staff/admin manage |
| `tms_grievance_comment` | `grievance_communications` | `grievance_id→tms_grievance`, `sender_id`, `message` | participants only |
| `tms_enrollment_request` | `transport_enrollment_requests` | `learner_id`, `preferred_route_id`, `preferred_stop_id→tms_route_stop`, `status`, `admin_notes` | learner own + admin manage (Admin already has an `enrollment-requests` UI shell waiting for this) |
| `tms_route_allocation` | `student_route_allocations` | `learner_id`, `route_id`, `boarding_stop_id`, `is_active` | learner read own. (Or keep using `learners_profiles.transport_route_id/transport_stop_id` as the live allocation and use this table for history.) |
| `tms_location_ping` | `location_tracking` | `driver_id→tms_driver`, `route_id`, `lat`, `lng`, `accuracy`, `recorded_at`, `source` | driver insert own; learners/staff read by route. Powers `/portal/live-track` + Admin `track-all`. |
| `tms_staff_route_assignment` | `staff_route_assignments` | already exists as `tms_staff_route_assignment` ✅ | reuse |

### 4.2 Tables to REUSE (already present)

- `learners_profiles` — the learner master + live transport allocation (`bus_required`, `transport_route_id`, `transport_stop_id`, `transport_fee`). Replaces `students`.
- `tms_route`, `tms_route_stop`, `tms_route_possible_stop`, `tms_driver`, `tms_vehicle` — the route/fleet master. Replace `routes`/`route_stops`/`drivers`/`vehicles`.
- `staff` — replaces the passenger `staff` table.
- `profiles`, `custom_roles`, `user_roles` — auth & RBAC.
- `notifications`, `push_subscriptions` — reuse for the notification + web-push stack.

### 4.3 Entity rename map (apply across all ported logic)

```
students                       → learners_profiles            (PK differs; key by learner_id)
students.id                    → learners_profiles.id
students.allocated_route_id    → learners_profiles.transport_route_id
students.boarding_stop         → learners_profiles.transport_stop_id (→ tms_route_stop)
students.transport_fee         → learners_profiles.transport_fee
drivers                        → tms_driver
vehicles                       → tms_vehicle
routes / route_stops           → tms_route / tms_route_stop
schedules / bookings           → tms_schedule / tms_booking
attendance                     → tms_attendance
semester_payments / _fees      → tms_semester_payment / tms_fee_structure
grievances (+children)         → tms_grievance (+ tms_grievance_comment)
transport_enrollment_requests  → tms_enrollment_request
student_route_allocations      → tms_route_allocation (or learners_profiles columns)
location_tracking              → tms_location_ping
admin_users (grievance assignee)→ profiles
```

> All migrations go through `supabase/migrations/` (and can be applied via the Supabase MCP per project convention). Enable RLS on every new learner-owned table; the `withAuth` handlers still use `createServiceRoleClient()` after the permission check, but RLS is the **defense-in-depth backstop the Passenger app never had**.

---

## PART 5 — What to port, rebuild, or drop

### 5.1 PORT (donate as self-contained components, light rework)

- **QR scanner** — `app/staff/components/TicketScanner.tsx` (`html5-qrcode`) → `components/shared/qr-scanner.tsx`.
- **QR ticket generation** — inline `QRCodeSVG` usage → `components/shared/qr-ticket.tsx`.
- **Razorpay gateway** — `lib/razorpay.ts` (order create + HMAC verify) → `lib/payments/razorpay.ts` (add server-side amount calc; always verify webhook signature).
- **Receipts** — `invoice-receipt.tsx`, `color-coded-receipt.tsx` → `components/shared/receipt.tsx`.
- **Push service** — `lib/push-notifications.ts` (VAPID) → consolidate into Admin's push module.
- **Date/currency helpers** — selected `lib/utils.ts` funcs (`formatCurrency` INR, `DateUtils`) — merge carefully (watch `cn` clash).
- **i18n (optional)** — `lib/i18n/language-context.tsx` (EN/Tamil) if bilingual is desired.

### 5.2 REBUILD (use Passenger pages as the spec, build on Admin pattern)

Every learner/driver/staff **page** and every **API route** — rebuilt as `page.tsx` (TanStack Query + DataTable / mobile cards) + `withAuth` route + `lib/<module>/{types,refs}.ts`, pointed at `tms_*` tables, identity from session. The Passenger pages are the UX/behavior reference, not the code.

### 5.3 DROP (do not bring into the codebase)

- All Passenger **auth** (`lib/auth/*`, `parent-auth-service*`, `unified-auth-service`, `driver/staff-auth-service`, `auto-login`, `middleware.ts`).
- The **god-module** `lib/supabase.ts` (`studentHelpers`) and `lib/supabase-client.ts` fallback factory.
- **All ~104 API routes** (replaced) — especially `auth/validate`, `auth/oauth-workaround` (backdoor), `payments/process-dummy`, `setup-demo`, every `debug/*`, `test-*`, `payments/test-keys`/`config-check`.
- Passenger **`components/ui/*`** (non-Radix Select/Tabs/Badge/Progress), `theme-provider.tsx`, `lib/theme-constants.ts`, the hand-rolled chart components.
- All `*.md` status files, `*.js` debug scripts, the bug-reporter SDK (Admin has its own).

---

## PART 6 — Phased implementation plan

> Sequenced so each phase ships something usable and earlier phases unblock later ones. Phases 1–2 deliver a working learner portal on **data that already exists** (routes, stops, allocation, notifications) before any new transactional tables are needed.

**Phase 0 — Decisions & spike (½–1 wk)**
- Confirm: single-app re-platform; `/portal` prefix; `learners_profiles.profile_id` linkage strategy.
- Add `profiles → learners_profiles` / `profiles → tms_driver` link columns (or confirm email-join is acceptable interim).
- Spike: log in as a test `student` profile, prove `proxy.ts` routes them to a stub `/portal/dashboard`. Validates the whole auth thesis end-to-end.

**Phase 1 — Foundation (1–2 wk)**
- Generalise `proxy.ts` for area-by-role routing + per-area permission gate.
- Add `tms.passenger.*`/`tms.driver.*` keys; seed onto `student`/`driver` roles (migration).
- Build the **learner shell** (`app/portal/layout.tsx` + `components/portal/*`: sidebar, mobile bottom-nav, FAB) using Admin's UI kit.
- `app/api/portal/me/route.ts` + `getLearnerForUser` self-scoping helper.
- `/portal/dashboard` (enrollment + payment status from `learners_profiles`), `/portal/profile`, `/portal/settings`.

**Phase 2 — Read-only learner modules on existing data (1–2 wk)**
- `/portal/routes` (my route + stops from `tms_route`/`tms_route_stop` via `learners_profiles.transport_route_id`).
- `/portal/notifications` (existing `notifications` + `push_subscriptions`).
- Driver area scaffold: `/driver/dashboard`, `/driver/routes` from `tms_driver` assignment.

**Phase 3 — Enrollment + Schedules + Bookings + Attendance (2–4 wk)**
- Create `tms_enrollment_request`, `tms_schedule`, `tms_booking`, `tms_attendance` (+ RLS).
- Learner: `/portal/enrollment`, `/portal/schedules` (view + book + QR ticket), `/portal/bookings`.
- Admin counterparts: wire the existing `enrollment-requests`, `schedules`, `bookings` UI shells to the new tables.
- Boarding scanner: `/boarding/*` + `qr-scanner` + `tms.attendance.scan`.

**Phase 4 — Payments (2–3 wk)**
- Create `tms_semester_payment` (+ `tms_fee_structure`). Port Razorpay; **server computes amount**; webhook always signature-verified.
- Learner: `/portal/payments` (pay + history + receipt). Admin: payments dashboard over `tms_semester_payment`.

**Phase 5 — Grievances (1–2 wk)**
- Create `tms_grievance` (+ comment/activity). Learner submit + track + chat; Admin `grievances` queue.

**Phase 6 — Live tracking + push reminders (2–3 wk)**
- Create `tms_location_ping`. Driver broadcast (`tms.tracking.share`); learner `/portal/live-track` consumer map (reuse `react-leaflet`/`track-all`); Admin `track-all` already benefits.
- Booking-reminder scheduler (protected route / Supabase cron) + web-push.

**Phase 7 — PWA, i18n, hardening (1–2 wk)**
- PWA manifest/service worker scoped to `/portal` & `/driver`; optional EN/Tamil; run `/security-review`; add tests for the new modules.

---

## PART 7 — Challenges, dependencies & migration considerations

1. **Auth re-platform is the critical path.** Everything keys off the session-derived identity model. De-risk it in Phase 0 with a real student login. The unblocker is the confirmed fact that learners/drivers already have `profiles` rows.
2. **`profiles ↔ learners_profiles` / `profiles ↔ tms_driver` linkage.** No hard FK exists today (email is the only obvious join key). Add a `profile_id`/`auth_user_id` column for a reliable, fast, secure join — email matching is fragile (case, college vs personal email, duplicates).
3. **The transactional domain is greenfield.** Bookings/schedules/payments/grievances/attendance/enrollment tables don't exist. This is design work, not migration — a chance to model them cleanly with RLS from day one, but it's the bulk of the effort.
4. **Existing Passenger production data.** If TMS-PASSENGER-NEW runs live against a *different* Supabase project, there may be real bookings/payments/grievances history to migrate. **Confirm whether that data exists and must be preserved** — it changes Phases 3–5 from "create" to "create + ETL". (Open question for you.)
5. **Next 15 → 16 upgrade tax** on any ported file (async `cookies()`/`headers()`, `middleware.ts`→`proxy.ts`, React 19 already aligned).
6. **Security posture inversion.** The Passenger app trusts the client; the Admin trusts the session. Every ported behavior must flip to session-derived identity + permission check + RLS. Never port a route that takes an `id` from the client.
7. **Mobile-first vs desktop-first.** The learner/driver shells are mobile-first PWAs; the Admin is a desktop DataTable app. Build distinct shells (don't force learners through the admin sidebar); the project already has a `mobile-bottom-navbar` skill/pattern to lean on.
8. **Terminology (JKKN).** Use **Learner** (not Student) in all new UI/labels/keys, consistent with `learners_profiles` and the existing `passengers/learners` module.
9. **Brand color normalization.** The Passenger app ships three greens (`#0b6d41`, `#22c55e`, `#10b981`); adopt the Admin's OKLCH token system — don't import Passenger theme constants.
10. **Payments are real money.** Server-side amount calculation, idempotent order creation, mandatory webhook signature verification, and reconciliation against `tms_fee_structure` — none of which the Passenger app does correctly.
11. **Notifications/push consolidation.** Reuse the existing `push_subscriptions`/`notifications` tables and Admin's `/notifications/push`; don't stand up a parallel push service.
12. **Legacy admin shells are also tableless.** `schedules`, `bookings`, `grievances`, `enrollment-requests` admin modules currently have no backing tables either — building the `tms_*` tables fixes the *admin* side too, so design them for both consumers at once.

---

## PART 8 — Decisions needed from you

1. **Confirm strategy:** single-app re-platform onto Admin architecture (recommended) vs monorepo.
2. **Learner URL prefix:** `/portal` (recommended), `/me`, `/student`, or `/p`.
3. **Identity linkage:** add `learners_profiles.profile_id` / `tms_driver.profile_id` FKs (recommended) vs interim email-join.
4. **Existing Passenger data:** is there live booking/payment/grievance history (in a separate Supabase project) that must be migrated, or is this a clean build?
5. **Scope of first milestone:** ship the read-only learner portal (Phases 0–2) first, or prioritise a specific module (e.g., Payments)?
6. **Optional adopts:** EN/Tamil i18n? Jest/Playwright test stack for new modules?

---

*Appendix: the cloned Passenger repo for reference lives at `D:\Sangeetha_V\TMS-PASSENGER-NEW` (a sibling of this repo, outside the Admin git tree).*
