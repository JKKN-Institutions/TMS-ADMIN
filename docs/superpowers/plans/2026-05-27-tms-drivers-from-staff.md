# TMS Drivers (from MyJKKN staff + tms_driver) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obsolete `drivers`-table CRUD module with a module that lists driver-role users from MyJKKN `staff` (basics, read-only) joined to a new TMS-owned `tms_driver` extension table (operational details, editable), in a reusable TanStack + shadcn data table.

**Architecture:** `GET /api/admin/drivers` (service-role, `withAuth`) reads `staff WHERE role_key='driver'`, fetches matching `tms_driver` rows, and merges by `staff_id` (LEFT-join semantics) into an extended `DriverListItem`. `PUT /api/admin/drivers` upserts the `tms_driver` row (operational fields only; `tms.drivers.manage` enforced). A client page renders a generic `<DataTable>` (client search/sort/filter/paginate/column-visibility) with View + Edit row actions.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase (`@supabase/ssr` + service-role), `@tanstack/react-table`, `@tanstack/react-query`, shadcn/ui (Radix), Tailwind v4.

> **Testing note:** This repo has **no automated test runner**. Each task is verified with `npx tsc --noEmit` (filtered to touched files), `npm run build`, and explicit manual browser checks — the project's established standard.

> **Ownership boundary:** MyJKKN owns `staff` (read-only here). TMS owns `tms_driver` (editable). Link: `tms_driver.staff_id → staff.id`, 1:1. Driver filter: `staff.role_key='driver'` (30 rows).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `components/ui/table.tsx` (new) | shadcn table primitives |
| `components/ui/dropdown-menu.tsx` (new) | Radix dropdown (column-visibility) |
| `components/ui/data-table.tsx` (new) | Generic `DataTable<TData,TValue>` |
| `supabase/migrations/20260527010000_create_tms_driver_table.sql` (done) | `tms_driver` schema (already applied) |
| `types/index.ts` (modify) | `DriverOps`, extended `DriverListItem`; remove `Driver`/`DriverFormData` (grep-guarded) |
| `app/api/admin/drivers/route.ts` (rewrite) | `GET` (staff+tms_driver merge) + `PUT` (upsert ops) |
| `app/(admin)/drivers/columns.tsx` (new) | Driver column defs (+ops columns, View/Edit actions) |
| `app/(admin)/drivers/driver-details-dialog.tsx` (new) | Read-only details (basics + ops) |
| `app/(admin)/drivers/driver-edit-dialog.tsx` (new) | Edit form for `DriverOps` fields |
| `app/(admin)/drivers/page.tsx` (rewrite) | Stat cards + `<DataTable>` + React Query + mutation |

**Left untouched (impact-checked):** `lib/database.ts` (shared by 21 files); `app/api/admin/drivers/location/[driverId]/route.ts` and `[driverId]/route-assignments/route.ts` (referenced by staff-route-assignments).

---

## Task 1: Install dependencies

**Files:** Modify `package.json`

- [ ] **Step 1:** `npm install @tanstack/react-table @radix-ui/react-dropdown-menu`
- [ ] **Step 2:** Verify: `node -e "require('@tanstack/react-table');require('@radix-ui/react-dropdown-menu');console.log('ok')"` → `ok`
- [ ] **Step 3:** Commit: `git add package.json package-lock.json && git commit -m "build(drivers): add react-table + radix dropdown-menu"`

---

## Task 2: shadcn primitives (`table`, `dropdown-menu`)

**Files:** Create `components/ui/table.tsx`, `components/ui/dropdown-menu.tsx`

> Open `components/ui/button.tsx`, copy its exact `cn` import (e.g. `import { cn } from '@/lib/utils'`); use the SAME path below.

- [ ] **Step 1: `components/ui/table.tsx`** — (unchanged shadcn primitives)

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
);
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b transition-colors hover:bg-gray-50', className)} {...props} />
  )
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-11 px-3 text-left align-middle font-medium text-gray-500 text-xs uppercase tracking-wide', className)} {...props} />
  )
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn('px-3 py-3 align-middle', className)} {...props} />
);
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
```

- [ ] **Step 2: `components/ui/dropdown-menu.tsx`**

```tsx
'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn('z-50 min-w-[12rem] overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-md', className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-gray-100', className)}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator><Check className="h-4 w-4" /></DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-xs font-semibold text-gray-500', className)} {...props} />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel };
```

- [ ] **Step 3:** Verify: `npx tsc --noEmit 2>&1 | grep -E "components/ui/(table|dropdown-menu)" || echo CLEAN` → `CLEAN`
- [ ] **Step 4:** Commit: `git add components/ui/table.tsx components/ui/dropdown-menu.tsx && git commit -m "feat(ui): shadcn table + dropdown-menu"`

---

## Task 3: Generic `DataTable`

**Files:** Create `components/ui/data-table.tsx`

- [ ] **Step 1: Create `components/ui/data-table.tsx`**

```tsx
'use client';

import * as React from 'react';
import {
  type ColumnDef, type ColumnFiltersState, type SortingState, type VisibilityState,
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export interface DataTableFilter {
  columnId: string;
  title: string;
  options: { label: string; value: string }[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  globalSearch?: boolean;
  filters?: DataTableFilter[];
  pageSize?: number;
}

export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder = 'Search...', globalSearch = true, filters = [], pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data, columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          {globalSearch && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="input pl-10 w-full" />
            </div>
          )}
          {filters.map((f) => (
            <select
              key={f.columnId}
              className="input w-full sm:w-auto"
              value={(table.getColumn(f.columnId)?.getFilterValue() as string) ?? ''}
              onChange={(e) => table.getColumn(f.columnId)?.setFilterValue(e.target.value || undefined)}
            >
              <option value="">{f.title}: All</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Columns <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            {table.getAllColumns().filter((c) => c.getCanHide()).map((column) => (
              <DropdownMenuCheckboxItem key={column.id} className="capitalize" checked={column.getIsVisible()} onCheckedChange={(v) => column.toggleVisibility(!!v)}>
                {column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-gray-500">No results.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{table.getFilteredRowModel().rows.length} row(s)</p>
        <div className="flex items-center gap-2">
          <select className="input" value={table.getState().pagination.pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))}>
            {[10, 20, 30, 50].map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
          <button className="btn-secondary disabled:opacity-50" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</button>
          <span className="text-sm text-gray-600">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}</span>
          <button className="btn-secondary disabled:opacity-50" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Verify: `npx tsc --noEmit 2>&1 | grep "data-table" || echo CLEAN` → `CLEAN`
- [ ] **Step 3:** Commit: `git add components/ui/data-table.tsx && git commit -m "feat(ui): generic TanStack DataTable"`

---

## Task 4: `tms_driver` migration (ALREADY APPLIED — verify + record)

**Files:** `supabase/migrations/20260527010000_create_tms_driver_table.sql` (already created)

> The table was applied to the shared project via MCP on 2026-05-27. This task only verifies and version-controls it.

- [ ] **Step 1: Confirm the table exists** (via Supabase MCP or psql)

`SELECT count(*) FROM information_schema.columns WHERE table_name='tms_driver';`
Expected: `20`.

- [ ] **Step 2: Confirm the migration file is committed**

```bash
git add supabase/migrations/20260527010000_create_tms_driver_table.sql
git commit -m "db(drivers): record tms_driver migration (applied via MCP)" || echo "already committed"
```

---

## Task 5: Types + drivers API (GET join + PUT upsert)

**Files:**
- Modify: `types/index.ts` (add `DriverOps`, extended `DriverListItem`)
- Rewrite: `app/api/admin/drivers/route.ts`

- [ ] **Step 1: Add types to `types/index.ts`** (after `TmsUser`)

```ts
export interface DriverOps {
  licenseNumber: string | null;
  licenseExpiry: string | null;
  experienceYears: number;
  rating: number;
  totalTrips: number;
  driverStatus: 'active' | 'inactive' | 'on_leave';
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  aadharNumber: string | null;
  medicalCertificateExpiry: string | null;
  locationSharingEnabled: boolean;
  assignedRouteId: string | null;
  notes: string | null;
}

export interface DriverListItem {
  id: string;            // staff.id
  name: string;
  firstName: string;
  lastName: string;
  designation: string;
  phone: string;
  email: string;
  employmentType: string;
  status: string;        // staff lifecycle status
  isActive: boolean;
  dateOfJoining: string | null;
  avatarUrl: string | null;
  institutionId: string;
  profileId: string | null;
  ops: DriverOps | null; // null = no tms_driver row yet
}
```

- [ ] **Step 2: Rewrite `app/api/admin/drivers/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { DriverListItem, DriverOps } from '@/types';

interface StaffRow {
  id: string; first_name: string | null; last_name: string | null; designation: string | null;
  phone: string | null; email: string | null; employment_type: string | null; status: string | null;
  is_active: boolean | null; date_of_joining: string | null; profile_picture: string | null;
  institution_id: string; profile_id: string | null;
}
interface OpsRow {
  staff_id: string; license_number: string | null; license_expiry: string | null; experience_years: number;
  rating: number; total_trips: number; driver_status: 'active' | 'inactive' | 'on_leave'; address: string | null;
  emergency_contact_name: string | null; emergency_contact_phone: string | null; aadhar_number: string | null;
  medical_certificate_expiry: string | null; location_sharing_enabled: boolean; assigned_route_id: string | null; notes: string | null;
}

function mapOps(o: OpsRow): DriverOps {
  return {
    licenseNumber: o.license_number, licenseExpiry: o.license_expiry, experienceYears: o.experience_years,
    rating: o.rating, totalTrips: o.total_trips, driverStatus: o.driver_status, address: o.address,
    emergencyContactName: o.emergency_contact_name, emergencyContactPhone: o.emergency_contact_phone,
    aadharNumber: o.aadhar_number, medicalCertificateExpiry: o.medical_certificate_expiry,
    locationSharingEnabled: o.location_sharing_enabled, assignedRouteId: o.assigned_route_id, notes: o.notes,
  };
}

function mapStaffToDriver(s: StaffRow, ops: OpsRow | null): DriverListItem {
  const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
  return {
    id: s.id, name: name || (s.email ?? 'Unknown'), firstName: s.first_name ?? '', lastName: s.last_name ?? '',
    designation: s.designation ?? '', phone: s.phone ?? '', email: s.email ?? '', employmentType: s.employment_type ?? '',
    status: s.status ?? '', isActive: s.is_active ?? false, dateOfJoining: s.date_of_joining,
    avatarUrl: s.profile_picture, institutionId: s.institution_id, profileId: s.profile_id,
    ops: ops ? mapOps(ops) : null,
  };
}

async function getDrivers() {
  try {
    const supabase = createServiceRoleClient();
    const { data: staffRows, error } = await supabase
      .from('staff')
      .select('id, first_name, last_name, designation, phone, email, employment_type, status, is_active, date_of_joining, profile_picture, institution_id, profile_id')
      .eq('role_key', 'driver')
      .order('first_name', { ascending: true });
    if (error) {
      console.error('Drivers (staff) query error:', error);
      return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
    }
    const staff = (staffRows ?? []) as StaffRow[];
    const ids = staff.map((s) => s.id);
    const { data: opsRows } = ids.length
      ? await supabase.from('tms_driver').select('*').in('staff_id', ids)
      : { data: [] as OpsRow[] };
    const opsByStaff = new Map<string, OpsRow>(((opsRows ?? []) as OpsRow[]).map((o) => [o.staff_id, o]));
    const drivers = staff.map((s) => mapStaffToDriver(s, opsByStaff.get(s.id) ?? null));
    return NextResponse.json({ success: true, data: drivers, count: drivers.length });
  } catch (e) {
    console.error('Drivers API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function upsertDriverOps(request: NextRequest, auth: AuthContext) {
  try {
    // Authorization: super-admin bypass, else require tms.drivers.manage.
    if (!auth.isSuperAdmin) {
      const { data: canManage } = await auth.supabase.rpc('user_has_permission', { permission_name: 'tms.drivers.manage' });
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const staffId: string | undefined = body?.staffId;
    const f = body?.fields ?? {};
    if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const payload = {
      staff_id: staffId,
      license_number: f.licenseNumber ?? null,
      license_expiry: f.licenseExpiry || null,
      experience_years: Number(f.experienceYears) || 0,
      rating: Number(f.rating) || 0,
      total_trips: Number(f.totalTrips) || 0,
      driver_status: f.driverStatus ?? 'active',
      address: f.address ?? null,
      emergency_contact_name: f.emergencyContactName ?? null,
      emergency_contact_phone: f.emergencyContactPhone ?? null,
      aadhar_number: f.aadharNumber ?? null,
      medical_certificate_expiry: f.medicalCertificateExpiry || null,
      location_sharing_enabled: !!f.locationSharingEnabled,
      assigned_route_id: f.assignedRouteId || null,
      notes: f.notes ?? null,
      updated_by: auth.userId,
    };
    const { data, error } = await supabase
      .from('tms_driver')
      .upsert(payload, { onConflict: 'staff_id' })
      .select()
      .single();
    if (error) {
      console.error('tms_driver upsert error:', error);
      return NextResponse.json({ error: 'Failed to save driver details' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Driver upsert error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getDrivers());
export const PUT = withAuth((request, auth) => upsertDriverOps(request, auth));
```

> Confirm `lib/api/with-auth.ts` exports `AuthContext`. (It does — defined when the auth flow was built.)

- [ ] **Step 3:** Verify: `npx tsc --noEmit 2>&1 | grep -E "api/admin/drivers/route|types/index" || echo CLEAN` → `CLEAN`
- [ ] **Step 4: Manual** (dev server, signed in as super_admin) — browser console:
```js
fetch('/api/admin/drivers').then(r=>r.json()).then(d=>console.log(d.count, d.data[0]))
```
Expected: count 30; first item has `name`/`email` populated and `ops: null` (no tms_driver rows yet).
- [ ] **Step 5:** Commit: `git add types/index.ts app/api/admin/drivers/route.ts && git commit -m "feat(drivers): GET join staff+tms_driver, PUT upsert ops"`

---

## Task 6: Columns + details dialog + edit dialog

**Files:** Create `app/(admin)/drivers/columns.tsx`, `driver-details-dialog.tsx`, `driver-edit-dialog.tsx`

> Before writing, open `components/ui/dialog.tsx` and confirm it exports `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`. Adjust imports if names differ.

- [ ] **Step 1: `app/(admin)/drivers/driver-details-dialog.tsx`**

```tsx
'use client';

import type { DriverListItem } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value || '—'}</span>
    </div>
  );
}

export function DriverDetailsDialog({ driver, open, onOpenChange }: {
  driver: DriverListItem | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const ops = driver?.ops;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Driver Details</DialogTitle></DialogHeader>
        {driver && (
          <div className="space-y-1 max-h-[70vh] overflow-auto">
            <div className="flex items-center gap-3 pb-3">
              {driver.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={driver.avatarUrl} alt={driver.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">{driver.name.slice(0,2).toUpperCase()}</div>
              )}
              <div><p className="font-semibold text-gray-900">{driver.name}</p><p className="text-sm text-gray-500">{driver.designation}</p></div>
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase pt-2">Staff</p>
            <Row label="Email" value={driver.email} />
            <Row label="Phone" value={driver.phone} />
            <Row label="Employment Type" value={driver.employmentType} />
            <Row label="Date of Joining" value={driver.dateOfJoining ?? '—'} />
            <p className="text-xs font-semibold text-gray-400 uppercase pt-3">Operational (TMS)</p>
            <Row label="License No." value={ops?.licenseNumber ?? '—'} />
            <Row label="License Expiry" value={ops?.licenseExpiry ?? '—'} />
            <Row label="Experience (yrs)" value={ops ? ops.experienceYears : '—'} />
            <Row label="Driver Status" value={ops?.driverStatus ?? '—'} />
            <Row label="Total Trips" value={ops ? ops.totalTrips : '—'} />
            <Row label="Rating" value={ops ? ops.rating : '—'} />
            <Row label="Emergency Contact" value={ops?.emergencyContactName ? `${ops.emergencyContactName} (${ops.emergencyContactPhone ?? '—'})` : '—'} />
            <Row label="Medical Cert. Expiry" value={ops?.medicalCertificateExpiry ?? '—'} />
            <Row label="Location Sharing" value={ops ? (ops.locationSharingEnabled ? 'Enabled' : 'Disabled') : '—'} />
            <Row label="Notes" value={ops?.notes ?? '—'} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `app/(admin)/drivers/driver-edit-dialog.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { DriverListItem, DriverOps } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

type FormState = Omit<DriverOps, 'experienceYears' | 'rating' | 'totalTrips'> & {
  experienceYears: string; rating: string; totalTrips: string;
};

function toForm(ops: DriverOps | null): FormState {
  return {
    licenseNumber: ops?.licenseNumber ?? '', licenseExpiry: ops?.licenseExpiry ?? '',
    experienceYears: String(ops?.experienceYears ?? 0), rating: String(ops?.rating ?? 0),
    totalTrips: String(ops?.totalTrips ?? 0), driverStatus: ops?.driverStatus ?? 'active',
    address: ops?.address ?? '', emergencyContactName: ops?.emergencyContactName ?? '',
    emergencyContactPhone: ops?.emergencyContactPhone ?? '', aadharNumber: ops?.aadharNumber ?? '',
    medicalCertificateExpiry: ops?.medicalCertificateExpiry ?? '', locationSharingEnabled: ops?.locationSharingEnabled ?? false,
    assignedRouteId: ops?.assignedRouteId ?? '', notes: ops?.notes ?? '',
  };
}

export function DriverEditDialog({ driver, open, onOpenChange }: {
  driver: DriverListItem | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(toForm(null));
  useEffect(() => { if (driver) setForm(toForm(driver.ops)); }, [driver]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/drivers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: driver!.id, fields: form }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
      return json;
    },
    onSuccess: () => { toast.success('Driver details saved'); qc.invalidateQueries({ queryKey: ['drivers'] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof FormState, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Driver — {driver?.name}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-3 max-h-[70vh] overflow-auto"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">License No.<input className="input" value={form.licenseNumber ?? ''} onChange={(e) => set('licenseNumber', e.target.value)} /></label>
            <label className="text-sm">License Expiry<input type="date" className="input" value={form.licenseExpiry ?? ''} onChange={(e) => set('licenseExpiry', e.target.value)} /></label>
            <label className="text-sm">Experience (yrs)<input type="number" min="0" className="input" value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} /></label>
            <label className="text-sm">Rating<input type="number" step="0.1" min="0" max="5" className="input" value={form.rating} onChange={(e) => set('rating', e.target.value)} /></label>
            <label className="text-sm">Total Trips<input type="number" min="0" className="input" value={form.totalTrips} onChange={(e) => set('totalTrips', e.target.value)} /></label>
            <label className="text-sm">Driver Status
              <select className="input" value={form.driverStatus} onChange={(e) => set('driverStatus', e.target.value)}>
                <option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On Leave</option>
              </select>
            </label>
            <label className="text-sm">Emergency Contact Name<input className="input" value={form.emergencyContactName ?? ''} onChange={(e) => set('emergencyContactName', e.target.value)} /></label>
            <label className="text-sm">Emergency Contact Phone<input className="input" value={form.emergencyContactPhone ?? ''} onChange={(e) => set('emergencyContactPhone', e.target.value)} /></label>
            <label className="text-sm">Aadhar No.<input className="input" value={form.aadharNumber ?? ''} onChange={(e) => set('aadharNumber', e.target.value)} /></label>
            <label className="text-sm">Medical Cert. Expiry<input type="date" className="input" value={form.medicalCertificateExpiry ?? ''} onChange={(e) => set('medicalCertificateExpiry', e.target.value)} /></label>
          </div>
          <label className="text-sm block">Address<input className="input w-full" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></label>
          <label className="text-sm block">Notes<textarea className="input w-full" rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.locationSharingEnabled} onChange={(e) => set('locationSharingEnabled', e.target.checked)} /> Location sharing enabled
          </label>
          <DialogFooter>
            <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save'}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: `app/(admin)/drivers/columns.tsx`**

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Eye, Pencil } from 'lucide-react';
import type { DriverListItem } from '@/types';

function Badge({ value, tone }: { value: string; tone: 'green' | 'yellow' | 'gray' }) {
  const cls = tone === 'green' ? 'bg-green-100 text-green-800' : tone === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-700';
  return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${cls}`}>{value || '—'}</span>;
}

export function getDriverColumns(
  onView: (d: DriverListItem) => void,
  onEdit: (d: DriverListItem) => void,
  canManage: boolean
): ColumnDef<DriverListItem>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <button className="flex items-center gap-1" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>Name <ArrowUpDown className="h-3 w-3" /></button>
      ),
      cell: ({ row }) => {
        const d = row.original;
        return (
          <div className="flex items-center gap-3">
            {d.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.avatarUrl} alt={d.name} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-semibold">{d.name.slice(0,2).toUpperCase()}</div>
            )}
            <span className="font-medium text-gray-900">{d.name}</span>
          </div>
        );
      },
    },
    { accessorKey: 'phone', header: 'Phone' },
    { accessorKey: 'email', header: 'Email' },
    {
      id: 'licenseNumber',
      header: 'License No.',
      accessorFn: (d) => d.ops?.licenseNumber ?? '',
      cell: ({ row }) => row.original.ops?.licenseNumber ?? '—',
    },
    {
      id: 'driverStatus',
      header: 'Driver Status',
      accessorFn: (d) => d.ops?.driverStatus ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => {
        const s = row.original.ops?.driverStatus;
        if (!s) return '—';
        return <Badge value={s.replace('_', ' ')} tone={s === 'active' ? 'green' : s === 'on_leave' ? 'yellow' : 'gray'} />;
      },
    },
    {
      id: 'experienceYears',
      header: 'Exp (yrs)',
      accessorFn: (d) => d.ops?.experienceYears ?? 0,
      cell: ({ row }) => (row.original.ops ? row.original.ops.experienceYears : '—'),
    },
    {
      accessorKey: 'employmentType',
      header: 'Employment',
      cell: ({ row }) => <span className="capitalize">{row.original.employmentType.replace(/_/g, ' ') || '—'}</span>,
    },
    {
      id: 'actions',
      enableHiding: false,
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button onClick={() => onView(row.original)} className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"><Eye className="h-4 w-4" /> View</button>
          {canManage && (
            <button onClick={() => onEdit(row.original)} className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"><Pencil className="h-4 w-4" /> Edit</button>
          )}
        </div>
      ),
    },
  ];
}
```

- [ ] **Step 4:** Verify: `npx tsc --noEmit 2>&1 | grep -E "drivers/(columns|driver-details-dialog|driver-edit-dialog)" || echo CLEAN` → `CLEAN`
- [ ] **Step 5:** Commit: `git add "app/(admin)/drivers/columns.tsx" "app/(admin)/drivers/driver-details-dialog.tsx" "app/(admin)/drivers/driver-edit-dialog.tsx" && git commit -m "feat(drivers): columns + details + edit dialogs"`

---

## Task 7: Rewrite the drivers page

**Files:** Rewrite `app/(admin)/drivers/page.tsx`

- [ ] **Step 1: Replace ENTIRE file with**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, UserCheck } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { usePermissions } from '@/hooks/use-permissions';
import { DataTable } from '@/components/ui/data-table';
import { getDriverColumns } from './columns';
import { DriverDetailsDialog } from './driver-details-dialog';
import { DriverEditDialog } from './driver-edit-dialog';

async function fetchDrivers(): Promise<DriverListItem[]> {
  const res = await fetch('/api/admin/drivers');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch drivers');
  return json.data as DriverListItem[];
}

export default function DriversPage() {
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.drivers.manage');
  const [viewing, setViewing] = useState<DriverListItem | null>(null);
  const [editing, setEditing] = useState<DriverListItem | null>(null);

  const { data: drivers = [], isLoading, isError } = useQuery({ queryKey: ['drivers'], queryFn: fetchDrivers });

  const columns = useMemo(() => getDriverColumns(setViewing, setEditing, canManage), [canManage]);

  const total = drivers.length;
  const active = drivers.filter((d) => d.isActive).length;
  const onDuty = drivers.filter((d) => d.ops?.driverStatus === 'active').length;
  const withLicense = drivers.filter((d) => !!d.ops?.licenseNumber).length;
  const stats = [
    { label: 'Total Drivers', value: total },
    { label: 'Active (Staff)', value: active },
    { label: 'On Duty', value: onDuty },
    { label: 'License On File', value: withLicense },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
        <p className="text-gray-600">Driver-role staff from MyJKKN, with TMS operational details</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" /><span className="text-gray-600">Loading drivers...</span></div>
      ) : isError ? (
        <div className="text-center py-16"><UserCheck className="w-10 h-10 text-gray-400 mx-auto mb-3" /><p className="text-gray-600">Failed to load drivers. Please retry.</p></div>
      ) : (
        <DataTable
          columns={columns}
          data={drivers}
          searchPlaceholder="Search name, email, phone..."
          filters={[
            { columnId: 'driverStatus', title: 'Driver Status', options: [
              { label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'On Leave', value: 'on_leave' },
            ] },
            { columnId: 'employmentType', title: 'Employment', options: [
              { label: 'Full-time', value: 'full_time' }, { label: 'Part-time', value: 'part_time' },
            ] },
          ]}
        />
      )}

      <DriverDetailsDialog driver={viewing} open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} />
      <DriverEditDialog driver={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
```

- [ ] **Step 2:** Verify build: `npm run build 2>&1 | grep -E "Compiled successfully|Failed|error occurred"` → `✓ Compiled successfully`
- [ ] **Step 3: Manual** — `/drivers`: 30 rows; search/sort/filter/paginate/column-toggle; "View" shows basics + (empty) ops; "Edit" (super_admin) opens form, saving persists and the row updates (License No. populates). Re-open to confirm persistence.
- [ ] **Step 4:** Commit: `git add "app/(admin)/drivers/page.tsx" && git commit -m "feat(drivers): page with data table, details + edit"`

---

## Task 8: Remove obsolete driver modals + dead types (grep-guarded)

**Files:** Delete the 4 driver modals; modify `types/index.ts`

- [ ] **Step 1:** Confirm modals unreferenced elsewhere:
```bash
grep -rEl "add-driver-modal|edit-driver-modal|driver-details-modal|driver-location-modal" app components lib --include=*.ts --include=*.tsx
```
Expected: only the modal files themselves (the rewritten page no longer imports them). If any OTHER file imports them, STOP and fix it first.

- [ ] **Step 2:** Delete:
```bash
git rm components/add-driver-modal.tsx components/edit-driver-modal.tsx components/driver-details-modal.tsx components/driver-location-modal.tsx
```

- [ ] **Step 3:** Check old `Driver`/`DriverFormData` usage:
```bash
grep -rEn "\bDriver\b|\bDriverFormData\b" app components lib --include=*.ts --include=*.tsx | grep -vE "DriverListItem|DriverOps|DriverCard|DriverDetails|DriverEdit|getDriverColumns|fetchDrivers|DriversPage|driver-(details|edit)-dialog"
```
Expected: no matches. If matches remain, **leave the types** and note it; else proceed.

- [ ] **Step 4:** If clean, delete the `export interface Driver {…}` and `export interface DriverFormData {…}` blocks from `types/index.ts`. Leave everything else.

- [ ] **Step 5:** Verify build: `npm run build 2>&1 | grep -E "Compiled successfully|Module not found|Failed"` → `✓ Compiled successfully`
- [ ] **Step 6:** Commit: `git add -A && git commit -m "chore(drivers): remove obsolete driver modals + dead types"`

---

## Task 9: Final verification

- [ ] **Step 1:** Type-check: `npx tsc --noEmit 2>&1 | grep -E "drivers|data-table|components/ui/(table|dropdown-menu)" || echo CLEAN` → `CLEAN`
- [ ] **Step 2:** Build: `npm run build 2>&1 | grep -E "Compiled successfully|Failed|error occurred"` → `✓ Compiled successfully`
- [ ] **Step 3: Manual E2E** — list (30 rows), search, filters (driver status + employment), sort (name), pagination, column visibility, View dialog (basics + ops), Edit dialog persists ops (License No. shows after save), Edit hidden for users lacking `tms.drivers.manage`.
- [ ] **Step 4:** No stray refs: `grep -rEl "add-driver-modal|edit-driver-modal|driver-location-modal" app components lib --include=*.tsx || echo CLEAN` → `CLEAN`

---

## Self-Review (completed during authoring)

- **Spec coverage:** staff basics read-only (Task 5 map), tms_driver editable extension (Task 4 migration + Task 5 PUT + Task 6 edit dialog + Task 7 page), join with LEFT-semantics (Task 5 merge keeps ops=null drivers), Standard table features (Tasks 3/6/7), proposed full field set (Task 4 migration + Task 5 types), Edit gated by `tms.drivers.manage` (Task 6 `canManage`, Task 5 PUT 403). ✓
- **Placeholders:** none — complete code in every step. ✓
- **Type consistency:** `DriverOps`/`DriverListItem` defined in Task 5 used identically in Tasks 6/7; `getDriverColumns(onView, onEdit, canManage)` matches its Task 7 call; PUT body `{ staffId, fields }` matches the edit dialog's `fetch` body; `AuthContext` import matches `lib/api/with-auth.ts`. ✓
- **Deviation from spec (intentional):** `lib/database.ts` and the `location`/`route-assignments` sub-routes retained (impact-checked — referenced elsewhere); drivers `POST` dropped, `PUT` repurposed for `tms_driver` upsert.
