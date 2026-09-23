> Superseded by docs/superpowers/specs/2026-09-23-bus-inspection-learner-check-design.md (2026-09-23).

# Bus Inspection (Transport Head checking) — Design

**Date:** 2026-09-21 · **Status:** Approved in brainstorming, awaiting spec review
**Branch:** `feat/bus-inspection` · **Supabase project:** `kvizhngldtiuufknvehv`

## 1. Purpose

The Transport Head periodically inspects each bus. They scan a QR sticker on the bus, see the bus's
details (documents, route, driver, riders), run a safety checklist, and record the result. Failures
become trackable issues, a bus can be grounded, and the driver is told what to fix. Admins see which
buses are due/overdue and route-wise reports.

Today none of this exists: buses have no QR, there is no inspection/checklist table, and compliance
dates live only on `tms_vehicle` with no history.

## 2. Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Kind of check | Periodic safety inspection (scheduled or surprise), full checklist |
| Frequency | Every `inspection_interval_days` (default **30**, in `admin_settings`); "Due soon" ≤ 7 days |
| On failure | Raise trackable issue per failed item; can ground bus; notify driver; the inspection is always saved as a report |
| Learners | Today's rider list, headcount check, **verify-only** JKKN ID scan, route-wise report |
| Learner scan | Verify only — never writes `tms_attendance` (boarding staff own attendance) |
| Checklist | Admin-editable list, seeded defaults, Critical/Normal severity; inspections snapshot item text |
| Placement | New module inside the **admin portal** (`app/(admin)/inspections`), phone-first |
| QR payload | Plain URL `https://<tms-domain>/i/<REG>` — unsigned; access is gated by login + permission |
| Presence evidence | Inspector geolocation + distance to bus's live GPS — **recorded, never enforced** |
| Grounding | `tms_vehicle.status='maintenance'` + warnings everywhere; **does not block** trips/bookings |

## 3. Facts the design relies on (verified 2026-09-21)

- Role `transport_head` exists in `custom_roles` (2 users) and holds all `tms.*` keys.
- `tms_vehicle`: 35 buses, all `active`; 9 expired PUC, 1 expired permit. `assigned_driver_id` is
  NULL on all rows → driver must be resolved via `tms_route.driver_id` (= `staff.id`).
- `tms_route.vehicle_id` links route→bus; 25 active routes; **no bus is on two active routes**.
- Riders today: `tms_booking(learner_id, travel_date, route_id, stop_id)`; boarded:
  `tms_attendance(learner_id, route_id, trip_date, direction, status, …)`.
- Nothing in the code enforces `status='maintenance'` (display/count only).
- Scanner lib is `html5-qrcode` (`components/boarding/scan-dialog.tsx`); `qrcode.react` is installed
  and unused. JKKN ID parsing: `lib/boarding/scan-resolve.ts#classifyScan`.
- Settings live in `admin_settings` (`app/api/admin/settings/route.ts`).

## 4. Data model (one migration per phase; tables all in Phase 1)

```
tms_inspection_checklist_item
  id uuid pk, category text check in (documents,safety,mechanical,body_interior,driver),
  label text not null, description text, severity text check in (critical,normal) default normal,
  sort_order int, is_active bool default true, created_at/updated_at/created_by/updated_by

tms_inspection
  id uuid pk, vehicle_id uuid not null fk tms_vehicle,
  route_id uuid null, driver_staff_id uuid null            -- snapshot at start
  inspected_by uuid not null (profiles.id), started_at, submitted_at,
  status text check in (draft,submitted) default draft,
  result text null check in (pass,pass_with_issues,fail),
  headcount_observed int, riders_booked int, riders_boarded int,
  inspector_lat numeric, inspector_lng numeric, bus_distance_m int, location_status text
     check in (ok,unavailable,bus_no_gps),
  grounded bool default false, notes text, created_at, updated_at
  unique partial index: one draft per vehicle  (vehicle_id) where status='draft'

tms_inspection_item
  id, inspection_id fk cascade, checklist_item_id fk null,
  label, category, severity  (snapshot), result text check in (pass,fail,na) null,
  note text, photo_paths text[] default '{}' check cardinality <= 3
  unique (inspection_id, checklist_item_id)

tms_inspection_issue
  id, inspection_id fk, inspection_item_id fk, vehicle_id fk, title, severity,
  status text check in (open,resolved,verified) default open, due_date date,
  resolution_note, resolution_photo_paths text[] (<=3), resolved_by, resolved_at,
  verified_by, verified_at, created_at, updated_at

tms_inspection_learner_check
  id, inspection_id fk cascade, learner_id uuid null, jkkn_id text,
  outcome text check in (ok,wrong_bus,not_booked,fee_due,unknown_card),
  on_this_route bool, booked_today bool, boarded_today bool, fees_ok bool, scanned_at
```

- Storage bucket `tms-inspection-photos` (private; 5 MB; jpeg/png/webp; signed URLs 1 h).
- RLS enabled on all tables; access is via service-role API routes (project pattern).
- Setting row `inspection_interval_days = 30` in `admin_settings`.
- Permissions (seed + grant to `transport_head`, merged with `jsonb ||`):
  `tms.inspection.view`, `tms.inspection.conduct`, `tms.inspection.manage`.
- Seed ~25 checklist items across the 5 categories (e.g. Documents: RC/Insurance/FC/Permit/PUC
  carried — critical; Safety: brakes, fire extinguisher valid, first-aid kit, emergency exit, horn,
  lights/indicators, speed governor — critical; Mechanical: tyres & spare, wipers, mirrors, leaks;
  Body/Interior: seats, windows, floor, cleanliness; Driver: uniform, licence carried, sober/fit).

## 5. Screens (admin portal, sidebar group "Bus Inspection")

| Route | Perm | Content |
|---|---|---|
| `/inspections` | view | Tiles Overdue / Due soon / Grounded / Open issues; per-bus table (last inspected, result, due); **Scan bus** |
| `/inspections/scan` | conduct | Camera scanner (reuse boarding camera fallback chain + photo fallback + `camera-errors.ts`); manual bus picker |
| `/i/[reg]` | conduct | Sticker URL → resolves bus → redirect to `/inspections/new?vehicle=<id>`; unknown → friendly page + picker |
| `/inspections/new?vehicle=` | conduct | 3-step check screen (below); creates/resumes the draft |
| `/inspections/[id]` | view | Report: bus, items, photos, riders/headcount, learner checks, issues, location evidence |
| `/inspections/issues` | manage | Issue queue; Resolve (note+photo) / Verify / Reopen |
| `/inspections/checklist` | manage | CRUD + reorder + enable/disable items |
| `/inspections/reports` | view | Route-wise: inspections, issues, grounded buses, riders affected; export |
| `/inspections/stickers` | manage | Printable A4 QR sheet (one or all buses) via `qrcode.react` |

`/i/[reg]` is **printed on stickers — its shape must never change**.

**Check screen steps:** (1) Bus card — reg, model, capacity, route, driver (tap-to-call), document
badges (green / amber ≤ 30 days / red expired) for insurance, fitness, permit, PUC, road tax, fire
extinguisher; last inspection; open issues; geolocation captured in background. (2) Riders — booked vs
boarded today, roster list, headcount input with mismatch, "Scan learner ID" with verdict card.
(3) Checklist — grouped Pass/Fail/N/A, "Mark remaining Pass", Fail requires note, ≤ 3 photos.
Submit → result computed; offer "Ground this bus" if any critical fail.

## 6. Rules

- **Result:** any critical fail → `fail`; else any fail → `pass_with_issues`; else `pass`.
  Submit requires every active item answered.
- **Due:** `last_submitted_at + interval`; Due soon ≤ 7 days; Overdue past; Never inspected.
- **Sticker code:** normalise = uppercase, strip non-alphanumerics; match normalised
  `registration_number`. `retired` bus → warning, still inspectable.
- **Draft:** one draft per bus (partial unique index); scanning resumes it. Draft items saved as
  answered (server-side autosave).
- **Learner scan outcome (first match wins):** unknown/retired card → `unknown_card`; today's
  booking/route ≠ this route → `wrong_bus`; no booking today → `not_booked`; fees overdue →
  `fee_due`; else `ok`. Typed JKKN IDs refused (camera only), as in boarding.
- **Issues:** created on submit for each failed item; `open → resolved` (note + ≥1 photo) →
  `verified`; reopen allowed. Default due date: critical +2 days, normal +7 days.
- **Grounding:** sets `status='maintenance'`, `grounded=true`. **Return to service** only when no
  critical issue for that bus is `open`. Warnings: red GROUNDED badge on vehicles page, dashboard,
  Track-All, and a warning banner in the driver's trip start. **Never blocks** trips or bookings.
- **Driver notification:** on submit with ≥ 1 fail, `notifyProfile` to the route driver's profile
  (`tms_route.driver_id → staff → profile`). No driver linked → skipped and shown on report.
- **Activity log:** module `inspections` added to the closed `ActivityModule` union; log submit,
  ground, unground, issue resolve/verify/reopen, checklist create/update/delete, sticker print.

## 7. Errors

No camera → photo fallback + manual picker. Geolocation denied → saved with `location_status=
unavailable`. Bus without GPS fix → `bus_no_gps`. Photo upload failure → per-photo retry, item result
kept. Save failure → draft kept server-side and on screen. Unknown sticker → friendly page.

## 8. Code layout

- Pure logic (no Supabase imports, unit-tested): `lib/inspections/{sticker-code,result,due,
  learner-verdict,issue-state,doc-status}.ts`.
- API (withAuth + service-role + local `requirePerm`, `{success,data,message}`):
  `app/api/admin/inspections/**` (list/dashboard, `[id]`, `start`, `[id]/items`, `[id]/submit`,
  `[id]/learner-scan`, `[id]/riders`, `photos`, `issues`, `issues/[id]`, `checklist`,
  `vehicles/[id]/ground`, `reports`, `resolve-sticker`).
- Scanner: extract the camera start chain from `scan-dialog.tsx` into a shared hook only if it can
  be done without changing boarding behaviour; otherwise a separate `components/inspections/
  bus-scanner.tsx` reusing `lib/boarding/camera-errors.ts`.

## 9. Delivery phases

1. **Core inspection** — migration (all tables, bucket, perms, seed, setting), stickers page,
   `/i/[reg]`, scanner, check screen steps 1 & 3, submit, report, dashboard.
2. **Follow-up** — issues queue, grounding + warnings, driver notification, checklist editor.
3. **Riders** — step 2: roster, headcount, verify-only learner scan.
4. **Reports** — route-wise report + export.

## 10. Testing

Vitest for all `lib/inspections/*` modules. Each new SQL function executed once on the real DB
before merge. Per phase: `node node_modules/next/dist/bin/next build`, scoped `tsc` on touched files,
route probes; phone test of scanning (signed-in flows need the user's browser).

## 11. Out of scope

Full offline inspection mode; signed QR tokens; blocking trips for grounded buses; odometer/service
scheduling; inspections by roles other than holders of `tms.inspection.conduct`.
