# Route Checkers — Design

**Date:** 2026-09-21 · **Status:** Approved in chat · **Related:** `2026-09-21-bus-inspection-design.md`

## Purpose

The Transport Head assigns **checkers** (any staff member, found by college email) to routes. A
checker opens **Route Check** in the staff app, picks an assigned route, sees every learner and
staff member for that route with **paid/unpaid** and **booked/not booked** status and who is **not
on this route**, identifies people by scanning the **MyJKKN QR** or the **ID-card barcode**, adds
people who cannot be scanned **manually with notes**, enters a **headcount** and **unknown count**
with notes, and submits. Checks are verify-only and linked to the bus inspection history.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Where checkers work | Staff app (boarding portal), new **Route Check** section |
| Scan effect | Verify + record in the check; **never** changes attendance |
| Scope | Riders check only (no safety checklist) |
| Reference / unscannable people | Manual entry: type (learner without card / staff without card / outside person) + name + notes |
| Assignment | Separate table — NOT `tms_staff_route_assignment` (that table waives staff fees, allocates learner shares, feeds notifications) |

## Card payloads (verified 2026-09-21, MyJKKN source + live data)

- **QR** (card front + MyJKKN app): the JKKN ID `NNNNNN-N` (Damm check digit), unique, public. Older
  cards may carry a raw UUID (`learners_profiles.id` or `profiles.id`).
- **Barcode** (card back): **Code 39**, bare value = `learners_profiles.roll_number` (learners;
  school learners fall back to `register_number`) or `staff.staff_id` (staff). Uppercased, A–Z 0–9
  `- . space`, ≤32 chars; strip `*` if a decoder returns them.
- `jkkn_identities`: learner → `learner_profile_id`; team_member → `team_member_id` (= `staff.id`);
  `both` → both; associate/external → `profile_id` only. 6,813 learner + 753 staff IDs active.
- Barcode ambiguity: 339 bus learners have no roll number; 46 bus learners share a roll number;
  25 `staff_id` values equal a learner roll number → a barcode can return several candidates; the
  checker picks (this route's people first). QR matches are unique.

## Access

- **Checker access comes from the assignment itself, not a role.** (The role-grant pattern in
  `lib/boarding/roles.ts` silently skips people who have never logged in — most checkers — so a
  role would be missing on their first login.) SECURITY DEFINER SQL function
  `tms_route_checker_route_ids(p_profile_id uuid) returns uuid[]`: active assignments whose
  `checker_email` matches the profile's email, or the matching staff row's `email` /
  `institution_email` (case-insensitive). `revoke all … from public; grant execute … to authenticated,
  service_role`; callable only for `p_profile_id = auth.uid()` unless service role.
- Permission `tms.route_check.manage` (Transport Head: assign + history), granted to `transport_head`.
  Super admins bypass. Checker APIs authorise by "route ∈ tms_route_checker_route_ids(user)" (or manage/super admin).
- `proxy.ts`: in the boarding-area deny branch, admit the user if the function returns ≥1 route;
  on the admin-area denied-redirect path, send such a user home to `/boarding/route-check`.
- `/api/boarding/access` also returns `checkerRouteCount`. Boarding layout: if the in-charge gate
  is not `in_duty` but `checkerRouteCount > 0` → **checker-only** mode (only `/boarding/route-check/**`
  reachable, nav shows Route Check only). In-charges who are also checkers see both.

## Data (one migration)

```
tms_route_checker_assignment (id, checker_email lower, route_id → tms_route, is_active, assigned_by, notes, assigned_at)
  unique (checker_email, route_id) where is_active
tms_route_check (id, route_id, vehicle_id, checker_id → profiles, check_date, leg onward|return,
  status draft|submitted, headcount, unknown_count, notes,
  registered, booked, present, unpaid, without_booking, not_on_route   -- snapshot at submit
  started_at, submitted_at, created_at, updated_at)
  unique (checker_id, route_id, check_date, leg) where status='draft'
tms_route_check_person (id, check_id → cascade, person_kind learner|staff|manual,
  learner_id, staff_id, manual_type learner_no_card|staff_no_card|outside, manual_name,
  matched_by jkkn_id|uuid|roll_number|register_number|staff_id|manual, scanned_code,
  outcome ok|not_on_route|no_booking|fee_unpaid|unknown_card|manual,
  on_route, booked, fee_state paid|unpaid|none|unknown|exempt, notes, created_at)
```

RLS on, permission-keyed SELECT; writes via service-role APIs.

## Outcomes

- Learner (first match wins): unknown/retired card → `unknown_card`; not allocated to AND not
  booked on this route today → `not_on_route`; no booking today → `no_booking`; fee unpaid
  (`rosterFeeBadge` state `unpaid`) → `fee_unpaid`; else `ok`.
- Staff: `staff.transport_route_id` ≠ route and not an active in-charge of the route → `not_on_route`;
  outstanding staff bill for the current transport year and not an in-charge (exempt) → `fee_unpaid`; else `ok`.
- Manual entries → `manual`.

## Screens

- **Admin → Route Checkers** (`/route-checkers`, manage): list of checkers × routes; Assign dialog
  (search all staff by name / email / institution email / login email, pick routes, notes);
  Unassign. **Route Checks** history (`/route-checks`, list + `[id]` report).
- **Staff app → Route Check**: `/boarding/route-check` (my routes, today's check status) →
  `/boarding/route-check/[checkId]` with Morning/Evening, counts (Registered · Booked · Present ·
  Unpaid · Without booking · Not on this route), filter chips (All · Unpaid · Without booking · Not on
  route · Staff), learners grouped by stop, Staff section (in-charges on duty + staff riders with
  bill status), **Scan** (QR + Code 39 + Code 128, wide scan box, camera-fresh photos), candidate
  picker, **Add manually**, **Finish** (headcount, unknown count prefilled with outside persons,
  notes) → Submit.
- **Bus Inspection link**: dashboard row shows "Last route check" for the bus's route; inspection
  report lists recent route checks for that route.

## Shared roster

Extract the admin attendance roster assembly (`app/api/admin/attendance/roster/route.ts`) into
`lib/attendance/route-roster.ts` with an option to load fees (`loadRosterFees`); the admin route,
the inspection Riders tab and the checker screen all use it → identical numbers.

## Out of scope

Marking attendance from a check; offline route checks; staff attendance; external-authority fields.
