# Passenger v1 — Master Implementation Plan (Confirmed Scope)

> **For Claude:** REQUIRED SUB-SKILL: @executing-plans (each phase's bite-sized tasks are written just-in-time as we reach it).
> Built from confirmed decisions in `docs/PASSENGER_FEATURE_ACCESS_SPEC.md` §8. Foundation task detail: `docs/plans/2026-06-09-passenger-integration-phase-0-1.md`. Analysis: `docs/PASSENGER_INTEGRATION_ANALYSIS.md`.

**Goal:** ship a unified TMS where Learners (`/student/*`) and boarding staff (`/boarding/*`) operate alongside the Admin dashboard, on the existing Supabase auth + RBAC, with a lean new schema.

**Confirmed model:** Pass-based ride (no per-trip booking) · Learner + Boarding personas (Driver = read-only shell) · Admin-recorded payments (no gateway) · Grievances + Live Tracking + Push + EN/Tamil all in.

---

## 1. v1 scope (locked)

**IN:** Dashboard, Profile (read-only), Enrollment, My Route & Stops, **QR Boarding Pass**, My Attendance, Notifications (inbox + push), Settings, Payments (view-only, admin-recorded), Grievances, Live Tracking, EN/Tamil bilingual UI. Boarding-staff scanner + attendance marking. Driver read-only shell.

**OUT (v2):** Razorpay online payment, per-trip seat booking + schedules, driver phone GPS broadcast.

## 2. New tables for v1 (lean — ~6)

| Table | Purpose | Key FKs | RLS |
|---|---|---|---|
| `tms_enrollment_request` | Learner requests a route+stop; admin approves | `learner_id→learners_profiles`, `preferred_route_id→tms_route`, `preferred_stop_id→tms_route_stop` | learner own + admin manage |
| `tms_boarding_pass` | Persistent QR pass tied to allocation (signed token, revocable) | `learner_id`, `route_id`, `pass_token`, `valid_from/until`, `status` | learner read own; boarding verify |
| `tms_attendance` | Boarding scans (present/absent) | `learner_id`, `route_id`, `trip_date`, `status`, `method`, `scanned_by→profiles` | learner read own; boarding write |
| `tms_payment_record` | Admin-recorded fee payments + receipts | `learner_id`, `route_id`, `academic_year`, `semester`, `amount`, `status`, `receipt_number`, `recorded_by` | learner read own; admin write |
| `tms_grievance` | Learner grievances | `learner_id`, `route_id`, `category`, `priority`, `status`, `assigned_to→profiles`, `resolution` | learner own; admin manage |
| `tms_grievance_comment` | Threaded messages | `grievance_id→tms_grievance`, `sender_id→profiles`, `message` | participants |
| *(optional)* `tms_fee_structure` | Fee per route/stop/semester | route/stop/semester → amount | read auth; admin write |

**Reused (no new table):** `learners_profiles`, `tms_route`, `tms_route_stop`, `tms_driver`, `tms_vehicle`, `staff`, `tms_staff_route_assignment`, `notifications`, `push_subscriptions`, `profiles`/`custom_roles`/`user_roles`. **Live Tracking** reuses the existing Admin GPS feed (`track-all` + `lib/gps-services`) — no new table.

## 3. Permission seed (revised for pass-based + admin-recorded)

| Role (`custom_roles.role_key`) | Keys seeded | Notes |
|---|---|---|
| `student` | `tms.passenger.self.view`, `tms.passenger.enrollment.request`, `tms.passenger.payment.view`, `tms.grievances.submit`, `tms.tracking.view` | NO `bookings.create`/`schedules.view` (no booking); payment is `.view` (admin records) |
| boarding role *(TBD — see §5)* | `tms.attendance.scan`, `tms.attendance.manage` | keys already in catalog |
| `driver` | `tms.driver.self.view` | read-only shell; `tracking.share` deferred to v2 |

## 4. Phase sequence

Foundation (Phases 0–1) is already detailed task-by-task in the Phase 0–1 plan doc. Phases 2–8 are scoped here at module/table/API/page granularity; **bite-sized tasks for each are written just-in-time when we reach it** (avoids premature detail that drifts).

| Phase | Delivers | New tables | Key pages / APIs |
|---|---|---|---|
| **0** | FK columns + permission keys + seed | — | migrations (see Phase 0–1 doc) |
| **1** | Role-aware proxy, role redirect, `/api/student/me`, `/student` shell, Dashboard/Profile/Settings | — | `proxy.ts`, `app/auth/callback`, `app/student/*`, `app/api/student/me` |
| **2** | My Route & Stops, Notifications inbox; **Boarding shell** (`/boarding`) + Driver read-only shell (`/driver`) | — | `app/student/routes`, `app/student/notifications`, `app/boarding/layout`, `app/driver/layout` |
| **3** | Transport Enrollment (learner request + admin approve wiring) | `tms_enrollment_request` | `app/student/enrollment`, `app/api/student/enrollment`, wire admin `enrollment-requests` |
| **4** | **QR Boarding Pass + Attendance** (learner pass; boarding scanner → mark attendance; learner history) | `tms_boarding_pass`, `tms_attendance` | `app/student/pass`, `app/boarding/scan` (html5-qrcode), `app/api/boarding/*`, `app/student/attendance` |
| **5** | Payments (admin-recorded): learner views status + receipt; admin records | `tms_payment_record` (+ opt `tms_fee_structure`) | `app/student/payments`, admin payment-record UI, `app/api/student/payments` |
| **6** | Grievances (learner submit/track/chat/rate; admin queue) | `tms_grievance`, `tms_grievance_comment` | `app/student/grievances`, `app/api/student/grievances`, admin `grievances` wiring |
| **7** | Live Tracking (learner route map from existing GPS feed) | — (verify `track-all` source) | `app/student/live-track`, reuse `react-leaflet` + GPS feed |
| **8** | Push notifications (VAPID + reminder scheduler), EN/Tamil i18n, PWA scoping, security review | — | push service consolidation, i18n provider, `/security-review` |

## 5. Open items to resolve in-phase (not blocking start)

1. **Boarding-staff identity (Phase 2/4):** which `profiles.role` / mechanism identifies a boarding scanner? Likely staff drawn from `tms_staff_route_assignment`; decide which `role_key` receives `tms.attendance.scan` (a transport role) and seed it. Confirm before Phase 4.
2. **Boarding pass token (Phase 4):** signed token in `tms_boarding_pass` (HMAC of `learner_id|route_id|valid_until`) verified server-side on scan; decide revocation/expiry policy.
3. **Live-tracking source (Phase 7):** confirm `track-all`/`lib/gps-services` exposes per-route live positions the learner map can consume; if not, fall back to a minimal `tms_location_ping` + a driver broadcast toggle (pulls Driver out of read-only).
4. **Profile edit (v2):** which contact fields (if any) a learner may edit (record is MyJKKN-owned) — read-only in v1.
5. **Legacy data (open from earlier):** still "not sure yet" whether prior Passenger booking/payment/grievance history must be migrated — only affects Phases 5–6 if it exists.

## 6. Execution

- Foundation (Phases 0–1) is ready to run now from the Phase 0–1 plan doc.
- ⚠️ Phase 0 applies migrations to the **live prod DB** and edits shared MyJKKN RBAC — each DB-touching step needs explicit approval at execution time.
- Two execution modes (choose when starting): **Subagent-Driven** (this session, fresh subagent per task + review) or **Parallel Session** (@executing-plans with checkpoints).

---

**This plan reflects the confirmed scope. On your go-ahead, implementation starts with Phase 0 (foundation).**
