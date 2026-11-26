# Driver inactive = MyJKKN inactive — design

Date: 2026-11-26 · Branch: `feat/driver-inactive` · Status: approved by the user (option A) on 2026-11-26

## Intent

The transport office wants to mark a driver Inactive in TMS and have that person show as Inactive in the MyJKKN employee list, without opening MyJKKN.

TMS and MyJKKN share one `staff` row per person. MyJKKN's Active / Inactive is `staff.is_active` (`staff.status` is draft / published and unrelated). So "inactive in MyJKKN" means "TMS writes `staff.is_active = false`"; no sync job is needed.

## What exists today (verified 2026-11-26)

- Edit Driver has two status boxes. Employment → Status writes `staff.is_active` and already reaches MyJKKN. Transport details → Driver status writes `tms_driver.driver_status` (active / inactive / on_leave), which nothing reads except the driver's own profile screen.
- A rolled-back dry run as the service role on a real driver: `is_active = false` set `profiles.is_active = false` (MyJKKN's `sync_staff_to_profiles` trigger), kept the staff code, and `is_active = true` restored both. `proxy.ts` refuses a profile that is not active, so the person is signed out of TMS.
- MyJKKN's own triggers then run as they do for any departure: WhatsApp connection disconnected, cohort-coordinator duty removed, auth-server webhook queued.
- All 33 drivers are in the Driver category, active, with valid records. 20 hold a route through `tms_route.driver_id`, 1 through `tms_driver.assigned_route_id`, 2 hold a phone, none is on `tms_vehicle.assigned_driver_id`. 10 have no `tms_driver` row.
- No screen hides an inactive driver from a driver dropdown, and nothing releases their route.

## Goals

- One status per driver: Active / On leave / Inactive. Inactive means the employee is inactive in MyJKKN. Active and On leave mean the employee is active.
- Mark inactive / active from the Drivers list and the driver's page, with a plain-language confirmation.
- An inactive driver is taken off their route (user's choice A) and is no longer offered in driver dropdowns.

## Non-goals

- A database migration. None is needed.
- Bulk inactivation, and inactivation through the import sheet.
- Putting a driver back on their old route when they are made active again.
- Collecting the driver's phone. The Driver Mobiles handover flow stays the way to do that; the confirmation only says how to.
- The legacy `components/create-schedule-modal.tsx` and `components/edit-route-modal.tsx`, which already list no drivers.

## Anti-goals

- Making inactive anyone TMS does not own. Only a `staff` row with `role_key = 'driver'` and the Driver category may be changed, checked on read and again inside the UPDATE.
- The two statuses disagreeing after a save.
- A route left pointing at a driver who cannot sign in.

## Approaches

1. **One status, enforced on the server (chosen).** `driver_status = 'inactive'` and `staff.is_active = false` always move together for records TMS owns. One box in the form, one quick action. The user picked this.
2. Keep both boxes and link them in the form only. Rejected: the API and the import could still make them disagree.
3. Only add a list action and leave the form. Rejected: the misleading "Driver status → Inactive" box would remain.

Route handling, user's decision: **A, take the driver off the route.** B (leave the route, only warn) was rejected by the user.

## Design

**The rule** (`lib/drivers/status-rule.ts`, pure, shared by server and screens):
- `employeeActiveFor(driverStatus)` is false only for `inactive`.
- `displayStatus(driver)`: an inactive employee is `inactive` whatever `driver_status` says; otherwise `driver_status`, defaulting to `active`.
- `isAssignable(driver)`: the employee is active and the display status is not `inactive`.

**Server** (`lib/drivers/status.ts`, service-role client passed in, as `lib/drivers/edit.ts` does):
- `setDriverActive(svc, driverId, active, actorId)`.
  - 404 when not a driver; 403 "This person's record is managed in MyJKKN." when not in the Driver category.
  - Going inactive is refused with 409 while the driver has a `tms_trip` with `status = 'active'`.
  - Writes `staff.is_active` first (the authoritative write, gated by id + role + category). Then, when going inactive, `releaseDriverDuties`: `tms_route.driver_id = null` for their routes, `tms_vehicle.assigned_driver_id = null`, and on an existing `tms_driver` row `driver_status = 'inactive'`, `assigned_route_id = null`, `location_sharing_enabled = false`. It never creates a `tms_driver` row.
  - Going active sets `driver_status = 'active'` on an existing row and restores nothing else.
  - A failure after the staff write does not undo it: the result carries a warning naming what was not released. My call: the employee flag is the thing asked for; a half-released route is visible and fixable, a silently re-activated employee is not.
  - Returns the released routes and the number of phones still held.
- `POST /api/admin/drivers/[driverId]/status` with `{ active: boolean }`, `tms.drivers.manage`, Activity Log entry (module `drivers`, action `update`).
- `updateDriver` (the edit form's save) applies the same rule: for a record TMS owns, `is_active` is taken from the chosen Driver status, never from the request's `isActive`; a change to inactive runs the same trip check and `releaseDriverDuties`.
- Import: a sheet row saying `inactive` for an active employee is reported as an error for that row ("Mark a driver inactive from the Drivers page"); an inactive employee is always stored as `inactive`.

**Screens**
- Edit Driver: the Employment → Status box is removed. Driver status shows the display status and, when Inactive is chosen, an amber note listing what will happen. For a record TMS does not own the note says the status applies to TMS only.
- Drivers list: the "Staff status" column becomes "Status" with Active / On leave / Inactive, and the ⋯ menu gains "Mark inactive" / "Mark active" for records TMS owns.
- Driver page: the same button beside Edit; the header badge shows the display status.
- Confirmation dialog: MyJKKN employee list, sign-in to every JKKN app, the route(s) they will be taken off, and that making them active again does not put them back. After saving, a toast reports any phone still held.
- Driver dropdowns in Routes (new, edit), Vehicles and Driver Mobiles list only assignable drivers, keeping the one already selected.

## Left to the builder

Component layout and wording details, test structure, and whether the dialog is one component with two modes.

## Verification

Vitest for the rule and the server functions; scoped typecheck with `node node_modules/typescript/bin/tsc --noEmit -p .` compared against main for touched files; a rolled-back database dry run of the exact statements. The signed-in visual check is the user's.
