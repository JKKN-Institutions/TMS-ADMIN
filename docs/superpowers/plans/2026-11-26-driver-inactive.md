# Driver inactive = MyJKKN inactive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marking a driver Inactive in TMS makes the employee inactive in MyJKKN, takes them off their route, and hides them from driver dropdowns.

**Architecture:** One pure rule module decides how `tms_driver.driver_status` and `staff.is_active` relate. One server module applies it (status write + duty release) and is called by a new status endpoint and by the existing edit save. Screens read the rule for display and for dropdown filtering.

**Tech Stack:** Next.js App Router, Supabase service-role client, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-driver-inactive-design.md`

## Global Constraints

- No database migration.
- Every `staff` write is filtered by `id`, `role_key = 'driver'` and `category_id = DRIVER_CATEGORY_ID`, and stamps `updated_by`.
- Not-owned record message, verbatim: `This person's record is managed in MyJKKN.` (existing `RECORD_MANAGED_ELSEWHERE_MESSAGE`).
- Never create a `tms_driver` row from a status change.
- Activity Log: module `drivers`, action `update` (the unions are closed).
- Typecheck with `node node_modules/typescript/bin/tsc --noEmit -p .` (`npx tsc` is a no-op here); tests with `node node_modules/vitest/vitest.mjs run lib/drivers`.
- User-facing wording is plain English; use "they", never "he/she".

## Review Focus

1. Driver with no `tms_driver` row (10 of 33) is marked inactive: must succeed, create no row, still release `tms_route.driver_id`.
2. Driver with a running trip (`tms_trip.status = 'active'`) is marked inactive: refused with 409, nothing written.
3. Edit form saved for an already-inactive driver without touching status: must not re-activate them and must not release duties twice.
4. Record not in the Driver category: status endpoint 403, edit save keeps `driver_status` TMS-only and never writes `staff.is_active`.
5. Route release fails after the staff write: the employee stays inactive and the caller gets a warning, not a 500 that hides the change.

---

### Task 1: The status rule

**Files:** Create `lib/drivers/status-rule.ts`, `lib/drivers/status-rule.test.ts`

**Interfaces — Produces:**
```ts
export type DriverStatus = 'active' | 'on_leave' | 'inactive';
export function normalizeDriverStatus(v: unknown): DriverStatus;            // unknown -> 'active'
export function employeeActiveFor(status: DriverStatus): boolean;           // false only for 'inactive'
export function displayStatus(d: { isActive: boolean; ops: { driverStatus: string } | null }): DriverStatus;
export function isAssignable(d: { isActive: boolean; ops: { driverStatus: string } | null }): boolean;
export const STATUS_LABEL: Record<DriverStatus, string>;                    // Active / On leave / Inactive
```

- [ ] Tests: `employeeActiveFor` is true for active and on_leave, false for inactive; `displayStatus` returns `inactive` when `isActive` is false even with `driverStatus: 'active'` or `ops: null`; returns `on_leave` / `inactive` from ops when the employee is active; `active` for `ops: null`; `isAssignable` false for both kinds of inactive, true for on_leave; `normalizeDriverStatus('x')` is `active`.
- [ ] Run, see fail; implement; run, see pass; commit.

### Task 2: Server — set status and release duties

**Files:** Create `lib/drivers/status.ts`, `lib/drivers/status.test.ts` (reuse the recording fake-client pattern from `lib/drivers/edit.test.ts`, adding `is`, `in`, `delete` nothing else needed: methods used are `select, eq, update, maybeSingle`).

**Interfaces — Produces:**
```ts
export const TRIP_RUNNING_MESSAGE = 'This driver has a trip running. End the trip first, then mark them inactive.';
export interface ReleaseResult { routes: { id: string; label: string }[]; mobilesHeld: number; warning?: string }
export async function assertNoRunningTrip(svc: SupabaseClient, driverId: string): Promise<void>; // throws OnboardError 409
export async function releaseDriverDuties(svc: SupabaseClient, driverId: string, actorId: string): Promise<ReleaseResult>;
export interface SetActiveResult extends ReleaseResult { id: string; name: string; active: boolean; changed: boolean }
export async function setDriverActive(svc: SupabaseClient, driverId: string, active: boolean, actorId: string): Promise<SetActiveResult>;
```

Behaviour the tests pin:
- `assertNoRunningTrip`: looks up `tms_driver.id` by `staff_id`; no row → passes; otherwise selects `tms_trip` with `driver_id = <tms_driver.id>` and `status = 'active'`, any row → `OnboardError({status: 409, error: TRIP_RUNNING_MESSAGE})`.
- `releaseDriverDuties` never throws. In order: `tms_route.update({driver_id: null, updated_by}).eq('driver_id', driverId).select('id, route_number, route_name')`; `tms_vehicle.update({assigned_driver_id: null}).eq('assigned_driver_id', driverId)`; `tms_driver.update({driver_status: 'inactive', assigned_route_id: null, location_sharing_enabled: false, updated_by}).eq('staff_id', driverId)`; count `tms_driver_mobile` rows with `driver_staff_id = driverId`. Route label is `` `${route_number ?? '?'} · ${route_name ?? ''}`.trim() ``. Any step error sets `warning` to `Marked inactive, but some assignments were not cleared. Check their route and bus.` and continues.
- `setDriverActive`: load `staff` (`id, first_name, last_name, is_active, role_key, category_id`) by id + `role_key = 'driver'`; missing → 404 `Driver not found`; not `canFullEdit` → 403 `RECORD_MANAGED_ELSEWHERE_MESSAGE`. Already in the requested state → `changed: false`, no staff write (but going inactive still runs `releaseDriverDuties` so a half-released driver can be finished). Going inactive: `assertNoRunningTrip` first. Staff update `{is_active, updated_by}` with the three `eq` filters and `.select('id')`; error → `translateStaffDbError`; zero rows → 403. Going active: `tms_driver.update({driver_status: 'active', updated_by}).eq('staff_id', id)`; returns `routes: [], mobilesHeld: 0`.

- [ ] Tests for each bullet plus Review Focus 1, 2, 4, 5 (5: route update returns an error → result has `warning`, staff update still happened, no throw).
- [ ] Run, see fail; implement; run, see pass; commit.

### Task 3: Status endpoint

**Files:** Create `app/api/admin/drivers/[driverId]/status/route.ts`

- [ ] `POST`, same auth shape as `PATCH` in `app/api/admin/drivers/[driverId]/route.ts` (`authFromRequest`, `tms.drivers.manage`). Body `{ active: boolean }`; non-boolean → 400 `Choose active or inactive`. Calls `setDriverActive`, logs activity (`entityType: 'staff'`, description `Marked driver <name> inactive` / `active`, plus ` and removed from <labels>` when routes were released), returns `{ success: true, data: SetActiveResult }`. `OnboardError` → its status and message.
- [ ] Typecheck the file; commit.

### Task 4: Edit save applies the rule

**Files:** Modify `lib/drivers/edit.ts` (`updateDriver`), `lib/drivers/edit.test.ts`

**Interfaces — Consumes:** Task 1 `normalizeDriverStatus`, `employeeActiveFor`; Task 2 `assertNoRunningTrip`, `releaseDriverDuties`. **Produces:** `UpdateDriverResult` gains `released?: ReleaseResult`.

- [ ] Tests (add; keep existing green — the fake needs `tms_trip`/`tms_route`/`tms_vehicle`/`tms_driver_mobile` to answer `{data: []}`, which the default already does):
  - owned row, `transport.driverStatus: 'inactive'`, `person.isActive: true` → staff update contains `is_active: false`; `tms_route` update with `driver_id: null` happened; upsert has `assigned_route_id: null`, `location_sharing_enabled: false`.
  - owned row stored `is_active: false`, `driverStatus: 'inactive'`, person unchanged → no staff update, no `tms_route` update (Review Focus 3).
  - owned row stored `is_active: false`, `driverStatus: 'active'` → staff update `is_active: true`.
  - owned row, transport-only body (no person), `driverStatus: 'inactive'` → staff update `{is_active: false, updated_by}` with the three filters.
  - not-owned row, `driverStatus: 'inactive'` → no staff update, no `tms_route` update, upsert `driver_status: 'inactive'`.
  - running trip + going inactive → 409 `TRIP_RUNNING_MESSAGE`, no writes.
  - `person.isActive` missing from the body no longer fails validation for an owned row.
- [ ] Implement: compute `status = normalizeDriverStatus(transport.driverStatus)` and `wantActive = employeeActiveFor(status)`. When `fullyEditable`: overwrite `person.isActive` with `wantActive` before `validatePerson`; after the diff, for a transport-only save add `is_active` to the patch when it differs from the stored value. `goingInactive = fullyEditable && row.is_active !== false && !wantActive` → `assertNoRunningTrip` before any write; after the upsert, `released = await releaseDriverDuties(...)`. When `fullyEditable && !wantActive`, the upsert payload forces `assigned_route_id: null` and `location_sharing_enabled: false`.
- [ ] Run all `lib/drivers` tests; commit.

### Task 5: Import cannot inactivate

**Files:** Modify `app/api/admin/drivers/import/route.ts`

- [ ] Load `id, is_active, role_key, category_id` for all resolved staff ids in one query (chunks of 150). Per row: employee inactive and owned → force `driver_status: 'inactive'`; employee active, owned, sheet says `inactive` → row error `Mark a driver inactive from the Drivers page`, row skipped. Not-owned rows unchanged.
- [ ] Typecheck; commit.

### Task 6: Screens — status dialog, list, driver page

**Files:** Create `app/(admin)/drivers/driver-status-dialog.tsx`, `app/(admin)/drivers/driver-status-badge.tsx`; modify `columns.tsx`, `page.tsx`, `[driverId]/page.tsx`

**Interfaces — Produces:** `DriverStatusDialog({ driver: DriverListItem | null, open, onOpenChange })` — direction is derived from `displayStatus(driver)`; `DriverStatusBadge({ status: DriverStatus })`.

- [ ] Dialog, modelled on `driver-delete-dialog.tsx`. Inactive copy (verbatim):
  - Title `Mark {name} inactive?`
  - `They will show as Inactive in the MyJKKN employee list.`
  - `They can no longer sign in to the driver app or any other JKKN app.`
  - When `driver.routes.length`: `They will be taken off {labels}. That route will have no driver until you choose one.`
  - `Making them active again later will not put them back on the route.`
  - Button `Mark inactive` (red). Active copy: title `Mark {name} active?`, `They will show as Active in MyJKKN and can sign in again. Choose their route again if they need one.`, button `Mark active` (green).
  - On success: invalidate `['drivers']`, `['driver', id]`, `['routes']`, `['vehicles']`; toast `{name} is now inactive` / `active`; if `warning` show it as an error toast; if `mobilesHeld > 0` toast `They still hold {n} phone(s). Collect it in Driver Mobiles.` for 8s.
- [ ] `columns.tsx`: column id stays `activeStatus`, label `Status`, accessor `displayStatus(d)`, cell `DriverStatusBadge`; new `onToggleStatus` argument before `canManage`; menu item `Mark inactive` / `Mark active` shown when `canManage && d.canFullEdit`.
- [ ] `page.tsx`: filter options Active / On leave / Inactive; wire the dialog.
- [ ] `[driverId]/page.tsx`: header badge from `displayStatus`; a `Mark inactive` / `Mark active` outline button beside Edit when `canManage && driver.canFullEdit`; replace the two fields `Active` and `Driver Status` with one `Status`.
- [ ] Typecheck touched files; commit.

### Task 7: Edit form — one status box

**Files:** Modify `app/(admin)/drivers/driver-form.tsx`, `app/(admin)/drivers/driver-person-fields.tsx`

- [ ] Remove the Employment → Status select from `driver-person-fields.tsx`.
- [ ] `driver-form.tsx`: initial `driverStatus` is `displayStatus(driver)` in edit mode. Before submit set `person.isActive = employeeActiveFor(status)` so client validation passes. Under the select, when `inactive` is chosen in edit mode: owned record → amber note `Inactive also makes this person inactive in MyJKKN, signs them out of every JKKN app and takes them off their route.`; not owned → grey note `This person's record is managed in MyJKKN, so this status applies to TMS only.` In `create-new` mode the Inactive option is not offered. When inactive is chosen the Assigned route select is disabled and cleared. On success also invalidate `['routes']`.
- [ ] Typecheck; commit.

### Task 8: Driver dropdowns list only assignable drivers

**Files:** Modify `app/(admin)/routes/new/page.tsx`, `app/(admin)/routes/[routeId]/edit/page.tsx`, `app/(admin)/vehicles/vehicle-form.tsx`, `app/(admin)/driver-mobiles/driver-mobile-api.ts` (+ its form if it needs the current id)

- [ ] Each fetch keeps `isAssignable(d)`; a screen that edits an existing record also keeps the driver already selected, labelled `{name} (inactive)`.
- [ ] Typecheck; commit.

### Task 9: Verify

- [ ] `node node_modules/vitest/vitest.mjs run lib/drivers` all green.
- [ ] Typecheck: no new errors in touched files compared with main.
- [ ] Rolled-back database dry run of the exact inactive sequence (staff update, route release, tms_driver update) on a driver who holds a route, as the service role, ending in `RAISE EXCEPTION`; then confirm 33 active drivers and 20 routes with a driver.
- [ ] Probe `POST /api/admin/drivers/x/status` unauthenticated → not 500.
