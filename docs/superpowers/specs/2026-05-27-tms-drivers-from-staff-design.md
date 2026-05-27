# TMS Drivers Module — Source from MyJKKN `staff` (Design Spec)

> **Date**: 2026-05-27
> **Status**: Approved design — awaiting spec review before implementation plan
> **Branch**: `feat/drivers-from-staff`
> **Supabase project**: shared MyJKKN (`kvizhngldtiuufknvehv`)

## 1. Summary

Replace the existing Drivers Management module (card UI backed by a `drivers` table that does **not** exist in this Supabase project) with a **read-only listing of driver-role users sourced from the MyJKKN `staff` table**, rendered in an **advanced data table** (TanStack Table + shadcn/ui). MyJKKN's staff module remains the system of record; TMS only reads.

## 2. Goals / Non-Goals

**Goals**
- List all `staff` rows where `role_key = 'driver'` (currently 30 rows).
- Advanced table UX: global search, per-column sorting, column filters, client-side pagination, column show/hide, row → details dialog.
- Reusable, generic `DataTable` component for future TMS modules.
- Remove the obsolete driver CRUD codebase.

**Non-Goals (deferred / out of scope)**
- No Add / Edit / Delete of drivers in TMS (managed in MyJKKN).
- No driver-operational data (license number, rating, total trips, live GPS, route assignments) — those columns are not in `staff` and are deferred until TMS-domain tables exist.
- No institution scoping — **all** driver-role staff are shown to every authorized user.
- No server-side pagination (dataset is tiny; client-side is sufficient).

## 3. Decisions (confirmed)

| # | Decision | Choice |
|---|----------|--------|
| 1 | CRUD scope | **Read-only view** (no Add/Edit/Delete in TMS) |
| 2 | Operational data (license/GPS/assignments) | **Defer** — staff fields only |
| 3 | Table features | **Standard** (search, sort, column filters, pagination, column visibility, row→details) |
| 4 | Institution scoping | **Show all** drivers to everyone |

## 4. Current State (to be replaced)

- `app/(admin)/drivers/page.tsx` — card-grid UI; reads `localStorage.adminUser`; fetches `/api/admin/drivers`; Add/Edit/Delete/Details/Location modals.
- `app/api/admin/drivers/route.ts` — `GET/POST/PUT` against a non-existent `drivers` table (wrapped with `withAuth`).
- Components: `add-driver-modal.tsx`, `edit-driver-modal.tsx`, `driver-details-modal.tsx`, `driver-location-modal.tsx`.
- Sub-routes: `app/api/admin/drivers/location/[driverId]/route.ts`, `app/api/admin/drivers/[driverId]/route-assignments/route.ts`.
- `types/index.ts` — `Driver`, `DriverFormData`.
- `lib/database.ts` — `DatabaseService` driver methods (used by the page import).

## 5. Data Source

**Filter:** `staff.role_key = 'driver'` → 30 rows today (all one institution, all `is_active = true`, all linked to a `profile_id` + `profile_picture`).

**Fields with real data (drive the columns):** `first_name`, `last_name`, `designation` ("Bus Driver"), `phone`, `email`, `employment_type`, `status` (staff lifecycle, e.g. "draft"), `is_active`, `date_of_joining`, `profile_picture`, `institution_id`, `profile_id`.

**Empty for drivers (excluded):** `staff_id`, `department_id`, `experience_years`.

### `DriverListItem` (API → UI shape)

```ts
interface DriverListItem {
  id: string;                 // staff.id
  name: string;               // `${first_name} ${last_name}`.trim()
  firstName: string;
  lastName: string;
  designation: string;        // e.g. "Bus Driver"
  phone: string;
  email: string;
  employmentType: string;     // staff.employment_type
  status: string;             // staff.status (lifecycle)
  isActive: boolean;          // staff.is_active
  dateOfJoining: string | null;
  avatarUrl: string | null;   // staff.profile_picture
  institutionId: string;
  profileId: string | null;
}
```

## 6. Architecture (Approach A)

```
staff (role_key='driver')
   │  service-role read
   ▼
GET /api/admin/drivers   (withAuth, read-only)  →  DriverListItem[]
   │  fetch
   ▼
React Query (useQuery ['drivers'])
   │
   ▼
<DataTable columns={driverColumns} data={drivers} />   (client: search/sort/filter/paginate/column-visibility)
   │  row "View"
   ▼
<DriverDetailsDialog driver={...} />
```

- **Data fetching:** server API route using the service-role client (guaranteed read regardless of `staff` RLS); consistent with the app's existing `/api/admin/*` + `withAuth` pattern.
- **Table operations:** all client-side via TanStack Table (30 rows).

## 7. Components

**New — reusable (generic):**
- `components/ui/table.tsx` — shadcn table primitives (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`).
- `components/ui/dropdown-menu.tsx` — shadcn dropdown (column-visibility menu).
- `components/ui/data-table.tsx` — generic `DataTable<TData, TValue>`: props `columns`, `data`, optional `searchKeys`, `filterableColumns`. Owns sorting, global filter, column filters, pagination, column visibility state.

**New — driver-specific:**
- `app/(admin)/drivers/columns.tsx` — `ColumnDef<DriverListItem>[]`: Avatar+Name (sortable), Designation, Phone, Email, Employment Type (badge), Status (badge), Active (badge), Joined (sortable, formatted), Actions (View).
- `app/(admin)/drivers/driver-details-dialog.tsx` — read-only details using existing shadcn `Dialog`.

**Rewrite:**
- `app/(admin)/drivers/page.tsx` — header + stat cards (`UniversalStatCard`) + `<DataTable>`; React Query; no localStorage, no Add button.
- `app/api/admin/drivers/route.ts` — `GET` queries `staff` (role_key='driver') and maps to `DriverListItem[]`; **remove `POST` and `PUT`**.

## 8. Table UX (Standard feature set)

- **Columns:** Avatar+Name · Designation · Phone · Email · Employment Type · Status · Active · Joined · (View action).
- **Global search:** across name, email, phone.
- **Column filters:** Status, Employment Type (Select dropdowns).
- **Sorting:** Name and Joined (extensible per column).
- **Pagination:** client-side, default page size 10, page-size selector.
- **Column visibility:** dropdown toggle.
- **Row action:** "View" opens read-only details dialog.

**Stat cards:** Total Drivers · Active (`is_active`) · Inactive · Full-time (`employment_type='full_time'`).

## 9. Removal Scope (with required impact check)

Before deleting each item, the implementation plan MUST grep for references; only remove if unreferenced or update the referrers.

| Item | Action |
|------|--------|
| `components/add-driver-modal.tsx`, `edit-driver-modal.tsx`, `driver-details-modal.tsx`, `driver-location-modal.tsx` | Remove (page is the only consumer) |
| `app/api/admin/drivers/route.ts` POST/PUT | Remove (keep GET, repurposed) |
| `app/api/admin/drivers/location/[driverId]/route.ts` | Remove **after** confirming track-all/GPS pages don't call it; otherwise leave + note |
| `app/api/admin/drivers/[driverId]/route-assignments/route.ts` | Remove **after** confirming staff-route-assignments page doesn't call it; otherwise leave + note |
| `DatabaseService` driver methods in `lib/database.ts` | Remove the driver-specific methods only |
| `Driver`, `DriverFormData` in `types/index.ts` | Remove; replace with `DriverListItem` |
| Driver schema/migration/SQL files | Scan `scripts/`, `supabase/` for any driver table SQL and remove; none expected (no `drivers` table in this project) |

## 10. Dependencies

- **Add:** `@tanstack/react-table`.
- **Present:** `@tanstack/react-query`, Tailwind, Radix UI (shadcn base: button, card, dialog, input, label, select, badge, etc.).

## 11. Verification

- `npm run build` compiles; `npx tsc --noEmit` clean on new/changed files.
- 30 driver rows render in the table.
- Global search, status/employment filters, name/joined sorting, pagination, and column-visibility all work.
- "View" opens the details dialog with correct data.
- No dangling imports from removed files (grep).
- Nav permission `tms.drivers.view` still gates the sidebar entry (unchanged).

## 12. File Change Summary

**New:** `components/ui/table.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/data-table.tsx`, `app/(admin)/drivers/columns.tsx`, `app/(admin)/drivers/driver-details-dialog.tsx`.
**Modified:** `app/(admin)/drivers/page.tsx`, `app/api/admin/drivers/route.ts`, `types/index.ts`, `package.json` (+`@tanstack/react-table`), `lib/database.ts` (remove driver methods).
**Removed:** the four driver modals; drivers POST/PUT; (pending impact check) the `location/[driverId]` and `[driverId]/route-assignments` sub-routes.
