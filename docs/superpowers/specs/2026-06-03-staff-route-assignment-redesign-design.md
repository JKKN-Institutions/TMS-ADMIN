# Staff Route Assignment — Redesign Design

- **Date:** 2026-06-03
- **Status:** Awaiting user review
- **Module:** `app/(admin)/staff-route-assignments` + `app/api/admin/staff-route-assignments`
- **Author:** brainstormed with the user (see decisions below)

## 1. Problem

The current Staff Route Assignment module lets an admin assign a staff member to a
route, but the assign form is a **free-text email `<input>`**. Nothing ties the
assignment to a real staff record: the backing table `tms_staff_route_assignment`
is keyed by `staff_email` (a string), so the list can only show a bare email, and
there is no link to the staff master data. The user wants the module to **reuse the
existing staff module** — search a staff member by name, see their details, select
them, and assign them to a route manually.

There is also a secondary inconsistency: the list page (`page.tsx`) gates actions on
the **legacy** `localStorage.adminUser` role while the API uses the **modern**
`withAuth` + `tms.drivers.assign` permission system.

## 2. Goals

- Replace the typed-email input with a **staff picker** sourced from the staff module.
- Link each assignment to a real staff record via **`staff_id`**.
- Enforce **one active route per staff** (a route may hold many staff).
- Allow **inline reassign** (move a staff to a different route) and remove.
- Align the module's auth with the modern `usePermissions()` pattern.

## 3. Non-goals (out of scope / YAGNI)

- Writing `transport_route_id` back to the MyJKKN-owned `staff` record.
- Reassignment history / audit trail.
- Bulk assign.
- Denormalising staff name/designation into the assignment row (joined fresh instead).
- A new permission key (`tms.staff.assign`) — reuse `tms.drivers.assign` to avoid
  role-JSON DDL.

## 4. Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Assignment meaning | **Operational** — staff is responsible for a route (NOT transport_route_id on the staff record). TMS owns the assignment in its own table. |
| Staff-side cardinality | **One active route per staff.** |
| Route-side cardinality | **A route may have many staff.** |
| Picker source | **Bus-required staff only** (`staff` where `bus_required = true`) — same set as Passengers → Staff. |
| Link key | **`staff_id`** (FK-style uuid; selected staff's id is stored). |
| Reassign UX | **Inline edit/reassign** (Edit action + edit page + PATCH). |
| Permission | Reuse **`tms.drivers.assign`**. |

## 5. Current state (for reference)

- **Table** `tms_staff_route_assignment` (migration `20260601000000`): columns
  `id, staff_email (not null), route_id (fk tms_route), assigned_at, assigned_by,
  is_active, notes, created_at, updated_at`. Partial unique index on
  `(staff_email, route_id) where is_active`. RLS gated on `tms.drivers.{view,assign}`.
- **API** `api/admin/staff-route-assignments/route.ts`: `withAuth` + service-role;
  GET (joins `tms_route` in JS), POST (by `staffEmail`), DELETE (soft `is_active=false`).
  Writes gated by `requireAssign` → `tms.drivers.assign`.
- **UI**: `page.tsx` (list, legacy localStorage auth), `columns.tsx` (shows bare
  `staff_email`), `assign/page.tsx` (free-text email + route select + notes).
- **Reuse template**: `app/(admin)/drivers/new/page.tsx` implements the exact
  "search staff → result list → select card with Change → form" UX, backed by
  `api/admin/drivers/staff-search` (searches `staff`, badges `alreadyDriver`).

## 6. Data model change (one additive migration — USER applies it)

New file `supabase/migrations/20260603000000_add_staff_id_to_tms_sra.sql`
(idempotent, additive; agent cannot run DDL):

```sql
-- Link staff↔route assignments to the real staff record by id, and enforce
-- one ACTIVE route per staff. Additive; safe to re-run.
alter table public.tms_staff_route_assignment
  add column if not exists staff_id uuid;   -- staff.id (MyJKKN-owned; no hard FK, matches passenger module's ownership boundary)

-- One active assignment per staff (a staff can hold only one route at a time).
create unique index if not exists uq_tms_sra_staff_active
  on public.tms_staff_route_assignment(staff_id)
  where is_active and staff_id is not null;

create index if not exists idx_tms_sra_staff_id
  on public.tms_staff_route_assignment(staff_id);
```

- `staff_email` stays (NOT NULL kept) — still populated from the selected staff for
  display fallback + backward compat. The old `(staff_email, route_id)` unique index
  is left as-is (harmless under the stricter staff_id rule).
- No hard FK to `staff`: `staff` is MyJKKN-owned and TMS only reads it (same choice
  the passenger module made — refs joined in JS, not via PostgREST embedding).

## 7. API changes (`app/api/admin/staff-route-assignments/`)

### 7a. New: `available-staff/route.ts` (GET, `withAuth`)
- Gate: `tms.drivers.assign` (super admin bypass).
- Query param `q` (≥ 2 chars). Search `staff` where `bus_required = true` and
  (`first_name|last_name|email ilike %q%`), `limit 10`.
- For the matched staff, look up existing **active** assignments (by `staff_id`) and
  the assigned route label (join `tms_route`) so the UI can badge & block.
- Returns `{ success, data: [{ id, name, staffId, designation, email, phone,
  isActive, alreadyAssigned, assignedRouteLabel }] }`.

### 7b. `route.ts` GET — enrich with staff
- After loading rows, additionally batch-fetch `staff` by `staff_id`
  (`id, first_name, last_name, staff_id, designation, email, phone`) into a JS Map
  (same pattern as the existing `tms_route` join).
- Each returned row gains `staff: { id, name, staffId, designation, email, phone } | null`
  alongside `routes`.

### 7c. `route.ts` POST — by `staffId`
- Body `{ staffId, routeId, notes? }` (replaces `staffEmail`).
- Validate: staff exists & `bus_required = true` (404/400 otherwise); derive
  `staff_email` from it; route exists in `tms_route`.
- Reject if the staff already has an active assignment (409) — app check backed by
  `uq_tms_sra_staff_active`.
- Insert `{ staff_id, staff_email, route_id, assigned_by: auth.userId, notes, is_active: true }`.

### 7d. `route.ts` PATCH — reassign (new)
- Body `{ assignmentId, routeId, notes? }`.
- Gate `tms.drivers.assign`. Validate route exists; update `route_id` (+ `notes`) on
  the active assignment. Staff stays the same, so `uq_tms_sra_staff_active` is
  unaffected.

### 7e. `route.ts` DELETE — unchanged
- Soft remove (`is_active = false`).

## 8. UI changes (`app/(admin)/staff-route-assignments/`)

### 8a. `assign/page.tsx` — rebuilt (mirror Create-Driver)
- `usePermissions()` for `canManage` (`tms.drivers.assign`).
- **Section 1 "Select staff member"**: search form → `/api/admin/staff-route-assignments/available-staff?q=` → result rows (avatar + name + `designation · staffId`), with an amber **"Already assigned to {route}"** badge that disables selection. Selected staff shown as a green card with **Change** (reuses the Create-Driver layout).
- **Section 2 "Assign to route"** (shown after select): active-route `<select>`
  (from `/api/admin/routes`, `status === 'active'`) + notes + submit. Posts `{ staffId, routeId, notes }`.

### 8b. `[id]/edit/page.tsx` — new (reassign)
- Loads the assignment (fetch the list, find by id — list is small), shows the staff
  as a **read-only** card + route `<select>` (preselected) + notes. Submits `PATCH
  { assignmentId, routeId, notes }`. Mirrors the drivers `[driverId]/edit` page shape.

### 8c. `columns.tsx` — richer staff column
- Replace the bare `staff_email` column with a **Staff** column: avatar + name +
  `designation` (sub-line) + staff ID. `AssignmentRow` gains
  `staff: { id, name, staffId, designation, email, phone } | null`.
- Keep Route / Trip / Schedule / Assigned date. Actions menu gains **Edit**
  (→ `/staff-route-assignments/{id}/edit`) alongside **Remove**.

### 8d. `page.tsx` — modernize auth
- Replace `localStorage.adminUser` role read with `usePermissions()`
  (`canManage = isSuperAdmin || can('tms.drivers.assign')`). Stats unchanged
  (Total assignments / Routes with staff / Staff assigned).

## 9. Permissions

No new keys. List/search/read = `tms.drivers.view` or `tms.drivers.assign` (RLS
already allows this); writes (POST/PATCH/DELETE) = `tms.drivers.assign`. Nav item
already gates on `DRIVERS_ASSIGN`.

## 10. Caveats / assumptions

- **User must apply the section-6 migration** before the write path works (agent
  can't run DDL on the Supabase project).
- Picker shows **only `bus_required = true` staff** (user confirmed they have such
  staff). If that set is empty the picker renders an empty state.
- `staff_email` is derived from `email ?? institution_email ?? ''` of the selected
  staff to satisfy the existing NOT NULL column.

## 11. Verification plan

- `tsc` filtered to the changed files (repo has ~828 pre-existing `never` errors and
  `ignoreBuildErrors:true`, so only changed-file diagnostics count).
- Dev-server route probes: `/staff-route-assignments`, `/staff-route-assignments/assign`,
  `/staff-route-assignments/{id}/edit`, and the three API verbs (proxy returns 307/401
  unauthenticated — confirms routing/compile, full render needs the user's browser).
- Manual (user's browser): search a bus-required staff → select → assign → see the row
  with staff name → edit/reassign → remove.

## 12. File-by-file change list

| File | Change |
|------|--------|
| `supabase/migrations/20260603000000_add_staff_id_to_tms_sra.sql` | **new** — add `staff_id` + indexes |
| `app/api/admin/staff-route-assignments/available-staff/route.ts` | **new** — bus-required staff search |
| `app/api/admin/staff-route-assignments/route.ts` | GET join staff; POST by `staffId`; **new** PATCH |
| `app/(admin)/staff-route-assignments/assign/page.tsx` | **rebuilt** — staff picker UX |
| `app/(admin)/staff-route-assignments/[id]/edit/page.tsx` | **new** — reassign page |
| `app/(admin)/staff-route-assignments/columns.tsx` | rich Staff column + Edit action |
| `app/(admin)/staff-route-assignments/page.tsx` | `usePermissions()` auth |
