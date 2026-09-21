# Bus Inspection — "Everything about this bus" (Phase 3, expanded) — Design

**Date:** 2026-09-21 · **Status:** Approved in chat · **Parent spec:** `2026-09-21-bus-inspection-design.md`

## Purpose

After scanning a bus sticker the Transport Head (or a super admin) sees the entire picture of that
bus: bus + driver + today's driver trip, the full stop list with morning/evening timings, learner
attendance, the boarding in-charge staff on duty, and staff who ride the bus — then does the
headcount, spot-scans learners' ID cards (verify only) and runs the checklist.

## Decisions

| Topic | Decision |
|---|---|
| Layout | Check screen gets tabs: **Bus · Stops · Riders · Staff · Checklist** |
| Leg | Morning (`onward`) / Evening (`return`) switch for Stops, Riders, Staff; default morning before 12:00 IST, evening after |
| Riders data | Client calls the EXISTING `GET /api/admin/attendance/roster?routeId&date&direction` (same numbers as the Attendance page and boarding staff screen) |
| Everything else | New `GET /api/admin/inspections/[id]/overview?leg=` |
| Boarding in-charge | Active `tms_staff_route_assignment` rows → staff name/phone; today's marks on this route+leg attributed by `scanned_by` profile; declared absence + cover from `tms_incharge_absence` |
| Driver attendance | `tms_trip` for route + today + leg: started/ended/status; none → "No trip started in the driver app" (app adoption is low — not "absent") |
| Staff riders | `staff` where `bus_required` and `transport_route_id` = route, with stop; boarding is **not recorded** anywhere — shown as such |
| Headcount | Transport Head enters counted people; server computes booked/boarded for the chosen leg and stores `headcount_observed`, `riders_booked`, `riders_boarded`, `riders_leg` |
| Learner scan | Verify-only JKKN ID scan (camera only) → `tms_inspection_learner_check`; outcome order: unknown_card → wrong_bus → not_booked → fee_due → ok; never writes attendance |
| Report | Shows the riders snapshot + learner checks |

## Data facts (verified 2026-09-21)

- `tms_route_stop(stop_name, stop_time, evening_time, sequence_order, is_major_stop, is_active)`; route 10 has 36 stops.
- `tms_staff_route_assignment(staff_email, route_id, is_active, source)` — 154 active.
- `tms_incharge_absence(staff_email, route_id, absence_date, covering_assignment_id, cover_status)`.
- `tms_trip(route_id, driver_id, travel_date, direction onward|return, status, started_at, ended_at)` — 16 trips in the last 7 days.
- `staff(first_name, last_name, phone, designation, email, institution_email, profile_id, bus_required, transport_route_id, transport_stop_id)` — 168 staff riders.
- `jkkn_identities(jkkn_id, learner_profile_id, retired_at, person_kind)`; fees via `loadLearnerFeeStatus` + `feeBadge` (tone `overdue` = fee due).
- Allocation: `learners_profiles.transport_route_id` (+ `bus_required`, active lifecycle) — what `loadRouteAttendanceRoster` uses.

## Out of scope

Recording staff-rider boarding; marking/correcting learner attendance from the inspection; evening
headcount history beyond the one snapshot per inspection.
