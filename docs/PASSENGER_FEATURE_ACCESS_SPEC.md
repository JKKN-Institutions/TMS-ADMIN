# Passenger (Learner) — Feature & Module Access Specification

> **Purpose:** the confirmable scope of what each non-admin persona can access in the unified TMS, before implementation begins. Sign off / trim this, and it becomes the contract the phases build to.
> Companion docs: `docs/PASSENGER_INTEGRATION_ANALYSIS.md` (analysis + roadmap), `docs/plans/2026-06-09-passenger-integration-phase-0-1.md` (foundation tasks).

---

## 1. How "access" is decided (three gates)

Every module below is gated by **all three** of these:

1. **Role / area** — `proxy.ts` confines a `student` to `/student/*` (a Learner can never open an admin page or another learner's data). Driver → `/driver/*`, boarding staff → `/boarding/*`.
2. **Enrollment state** — modules marked 🔒 only unlock once the learner has an active route allocation (`learners_profiles.transport_route_id` set / an approved enrollment). Before that they see an enrollment call-to-action.
3. **Permission key** — each module checks a `tms.*` key seeded on the `student` role (`custom_roles`). Removing a key from the role removes the module for all learners at once.

A Learner can only ever see/modify **their own** records — every Learner API derives identity from the session, never from a client-supplied id.

---

## 2. Learner (Passenger) module catalog

Legend — **Access:** Always (any logged-in learner) / 🔒 Enrollment-gated. **Phase** ties to the roadmap. **Status:** ✅ Core v1 / ⭐ Recommended / ❓ Decision (see §6).

### 2.1 Home / Dashboard — `/student/dashboard`
- **Learner can:** see enrollment status; allocated route + boarding stop + transport fee; payment status (paid / due); next upcoming trip; latest notifications; quick actions (pay, enroll, raise grievance); profile-completion nudge.
- **Data:** `learners_profiles` (+ later `tms_semester_payment`, `tms_booking`, `notifications`).
- **Permission:** `tms.passenger.self.view` · **Access:** Always · **Phase 1** (basic) → enriched later · **Status:** ✅

### 2.2 My Profile — `/student/profile`
- **Learner can:** view personal + academic + transport details (name, roll number, programme/department, route, stop, fee). **Read-only** in v1 (the record is MyJKKN-owned; edits to contact/emergency fields are a later TMS-side add-on).
- **Data:** `learners_profiles`.
- **Permission:** `tms.passenger.self.view` · **Access:** Always · **Phase 1** · **Status:** ✅

### 2.3 Transport Enrollment — `/student/enrollment`
- **Learner can:** request transport (choose route + boarding stop); see request status (pending / approved / rejected + admin notes); cancel or change a pending request. Approval happens admin-side (existing `enrollment-requests` module).
- **Data:** NEW `tms_enrollment_request`; reads `tms_route`, `tms_route_stop`.
- **Permission:** `tms.passenger.enrollment.request` · **Access:** Always (this is how a NOT-enrolled learner gets enrolled) · **Phase 3** · **Status:** ⭐

### 2.4 My Route & Stops — `/student/routes`
- **Learner can:** view their allocated route — number/name, full ordered stop list with timings, their boarding stop highlighted, assigned driver (name + contact), vehicle, and fare.
- **Data:** `tms_route`, `tms_route_stop`, `tms_driver`, `tms_vehicle` (all already exist).
- **Permission:** `tms.passenger.self.view` · **Access:** 🔒 · **Phase 2** · **Status:** ✅

### 2.5 Schedules — `/student/schedules`
- **Learner can:** view upcoming trip dates for their route (calendar/list); times; seat availability; whether the booking window is open.
- **Data:** NEW `tms_schedule`.
- **Permission:** `tms.schedules.view` · **Access:** 🔒 · **Phase 3** · **Status:** ❓ (depends on ride model — §6.A)

### 2.6 Trip Booking & My Bookings — `/student/bookings` (+ book action on Schedules)
- **Learner can:** book a seat for a date; view upcoming + past bookings; see booking + payment status; cancel within policy; get a **QR ticket** per confirmed booking.
- **Data:** NEW `tms_booking`.
- **Permission:** `tms.bookings.create` (write own) / `tms.passenger.self.view` (read own) · **Access:** 🔒 · **Phase 3** · **Status:** ❓ (ride model — §6.A)

### 2.7 QR Ticket / Boarding Pass — (rendered inside Bookings/Schedules)
- **Learner can:** display a scannable QR for a confirmed booking (or a persistent boarding pass in pass-based mode); view ticket details; works offline once loaded.
- **Data:** `tms_booking.qr_code`.
- **Permission:** `tms.passenger.self.view` · **Access:** 🔒 · **Phase 3** · **Status:** ⭐

### 2.8 My Attendance / Boarding History — `/student/attendance`
- **Learner can:** view their own boarding records (present/absent, date, route) marked by boarding staff.
- **Data:** NEW `tms_attendance` (read own).
- **Permission:** `tms.passenger.self.view` · **Access:** 🔒 · **Phase 3/5** · **Status:** ⭐

### 2.9 Payments — `/student/payments`
- **Learner can:** see fee due / fee structure for their route+semester; pay the semester/term transport fee online (Razorpay); view payment history; download receipts; track pending payments.
- **Data:** NEW `tms_semester_payment`, `tms_fee_structure`; `learners_profiles.transport_fee`.
- **Permission:** `tms.passenger.payment.pay` · **Access:** Always · **Phase 4** · **Status:** ❓ (online gateway vs admin-recorded — §6.C)

### 2.10 Live Tracking — `/student/live-track`
- **Learner can:** see their bus's live position on a map; ETA to their boarding stop; driver location-sharing status.
- **Data:** NEW `tms_location_ping`; `tms_route_stop`.
- **Permission:** `tms.tracking.view` · **Access:** 🔒 · **Phase 6** · **Status:** ❓ (§6.D) · depends on drivers broadcasting.

### 2.11 Grievances — `/student/grievances`
- **Learner can:** submit a grievance (category, priority, link to route/driver, description); track status; exchange threaded messages with admin; view resolution; rate the resolution.
- **Data:** NEW `tms_grievance`, `tms_grievance_comment`.
- **Permission:** `tms.grievances.submit` · **Access:** Always · **Phase 5** · **Status:** ❓ (§6.D)

### 2.12 Notifications — `/student/notifications`
- **Learner can:** read in-app notifications; mark read / mark-all-read; opt in/out of browser push; receive booking/trip reminders.
- **Data:** `notifications`, `push_subscriptions` (already exist).
- **Permission:** `tms.passenger.self.view` · **Access:** Always · **Phase 2** (inbox) + **Phase 6** (push) · **Status:** ✅ inbox / ❓ push (§6.D)

### 2.13 Settings — `/student/settings`
- **Learner can:** set notification preferences; theme; language (EN/Tamil, optional); privacy/location-sharing prefs.
- **Data:** small TMS-side prefs (or local) ; optional i18n.
- **Permission:** `tms.passenger.self.view` · **Access:** Always · **Phase 1** stub → **Phase 7** · **Status:** ✅ stub

> **Explicitly NOT accessible to a Learner:** any `/(admin)` page; any other learner's data; route/vehicle/driver/schedule *management* (create/edit/delete); other learners' bookings, payments, grievances, or attendance; admin reports.

---

## 3. Learner access matrix (by enrollment state)

| Module | Not yet enrolled | Enrolled (route allocated) |
|---|---|---|
| Dashboard | ✅ (shows "enroll" CTA) | ✅ (full) |
| Profile | ✅ | ✅ |
| Enrollment request | ✅ (primary action) | ✅ (view/change) |
| Notifications | ✅ | ✅ |
| Settings | ✅ | ✅ |
| Payments (fee) | ✅ (if a fee is due pre-allocation) | ✅ |
| Grievances | ✅ | ✅ |
| My Route & Stops | 🔒 hidden/locked | ✅ |
| Schedules | 🔒 | ✅ |
| Bookings / QR ticket | 🔒 | ✅ |
| Live Tracking | 🔒 | ✅ |
| My Attendance | 🔒 | ✅ |

---

## 4. Permission → module map (seeded on the `student` role)

| Permission key | Unlocks |
|---|---|
| `tms.passenger.self.view` | Dashboard, Profile, My Route, QR ticket, My Attendance (read), Notifications, Settings |
| `tms.passenger.enrollment.request` | Transport Enrollment |
| `tms.schedules.view` | Schedules |
| `tms.bookings.create` | Trip Booking |
| `tms.passenger.payment.pay` | Payments |
| `tms.grievances.submit` | Grievances |
| `tms.tracking.view` | Live Tracking |

---

## 5. Other personas in the unified app (for completeness)

### 5.1 Driver — `/driver/*` (`role = driver`, 35 accounts)
- **Driver can:** see assigned route(s) + ordered stops; today's passenger roster + bookings per route/date; toggle **live GPS location sharing** (broadcasts position); view own profile (license, trips, rating).
- **Permissions:** `tms.driver.self.view`, `tms.tracking.share`, `tms.tracking.view`.
- **Data:** `tms_driver`, `tms_route`, `tms_route_stop`, NEW `tms_booking`, `tms_location_ping`.
- **Phase 2** (read-only) → **Phase 6** (location broadcast). **Decision §6.B** (build now vs later).

### 5.2 Boarding / Attendance staff — `/boarding/*`
- **Staff can:** scan a learner's QR to verify the ticket/pass; mark attendance (single + bulk present/absent); see assigned routes + students per route.
- **Permissions:** `tms.attendance.scan`, `tms.attendance.manage`.
- **Data:** NEW `tms_attendance`, `tms_booking`; `tms_staff_route_assignment` (exists).
- **Phase 3.** **Decision §6.B.**

---

## 6. Product decisions to confirm (these change the build)

**A. Ride model — the biggest fork (drives Schedules + Bookings + QR scope):**
- **Pass-based:** pay semester fee → allocated route → board any day → QR/attendance scan. *Simplest; matches the existing `learners_profiles` allocation + fee model. No seat management.* → **Schedules/Bookings become a read-only timetable + a persistent boarding pass.**
- **Presence-confirm:** pass-based **plus** a daily "are you travelling tomorrow?" confirmation (matches the source app's reminder system) → lighter than seat booking, gives drivers a headcount.
- **Per-trip seat booking:** full booking with seat availability + booking windows + per-trip QR (what the source app implements). *Most complex; needs capacity/seat logic.*

**B. Persona scope for this build:** Learner only first, or Learner + Driver + Boarding together? (Boarding is needed for attendance scanning to be meaningful; Driver is needed for live tracking.)

**C. Payments:** integrate **Razorpay online payment** now (real-money gateway, needs keys + careful security), or start with **admin-recorded payments** (admin marks fee paid; learner just sees status) and add the gateway later?

**D. Optional modules for v1:** which of Live Tracking, Grievances, Browser Push notifications, and EN/Tamil bilingual UI are in this build vs deferred?

---

## 7. Recommended v1 (my proposal, pending your confirmation)

A focused, shippable Learner v1 that uses mostly-existing data and defers the heavy/real-money pieces:

**In v1:** Dashboard, Profile (read-only), Notifications (inbox), Settings (stub), Transport Enrollment, My Route & Stops, My Attendance (read), QR boarding pass, Grievances. Ride model = **Pass-based** (or Presence-confirm). Persona = **Learner + Boarding** (so attendance/QR is end-to-end), Driver read-only shell.

**Deferred to v2:** Razorpay online payments, Live Tracking + driver GPS broadcast, browser push reminders, per-trip seat booking (only if chosen), EN/Tamil.

## 8. CONFIRMED v1 scope (locked 2026-06-09)

- **A. Ride model → Pass-based.** Pay fee → allocated route → board any day → QR boarding-pass scan. NO per-trip seat booking, NO booking windows, NO seat availability. ⇒ `tms_schedule` and `tms_booking` are NOT built; "Schedules/Bookings" become a read-only route timetable + a **persistent boarding pass** (QR).
- **B. Personas → Learner + Boarding.** Build the Learner portal AND the boarding-staff scanner (QR → attendance) end-to-end. Driver = read-only shell only (no GPS broadcast in v1).
- **C. Payments → Admin-recorded.** Admin marks a learner's fee paid; learner sees status + receipt. NO Razorpay gateway in v1 (deferred to v2).
- **D. Optional modules → ALL IN:** Grievances, Live Tracking, Push notifications, EN/Tamil bilingual UI.
  - Live Tracking is sourced from the **existing Admin GPS feed** (`track-all` + `lib/gps-services` Mercyda devices) scoped to the learner's route — no driver-phone broadcast, no new `tms_location_ping` table (verified in Phase 7).

**v1 new tables (lean):** `tms_enrollment_request`, `tms_boarding_pass`, `tms_attendance`, `tms_payment_record` (+ optional `tms_fee_structure`), `tms_grievance`, `tms_grievance_comment`. Everything else reuses existing tables.

**Deferred to v2:** Razorpay online payment, per-trip seat booking, driver phone GPS broadcast.

See `docs/plans/2026-06-09-passenger-v1-master-plan.md` for the consolidated phase plan built from this confirmed scope.
