# TMS Drivers (from MyJKKN staff) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obsolete `drivers`-table CRUD module with a read-only listing of driver-role users from the MyJKKN `staff` table, rendered in a reusable TanStack + shadcn advanced data table.

**Architecture:** `GET /api/admin/drivers` (service-role, `withAuth`) selects `staff WHERE role_key='driver'`, maps to `DriverListItem[]`; a client page fetches via React Query into a generic `<DataTable>` that does client-side search/sort/filter/pagination/column-visibility; row "View" opens a read-only details dialog.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase (`@supabase/ssr` + service-role), `@tanstack/react-table`, `@tanstack/react-query`, shadcn/ui (Radix), Tailwind v4.

> **Testing note:** This repo has **no automated test runner** (no `test` script). Per the spec, adding a test framework is out of scope. Each task is therefore verified with `npx tsc --noEmit` (filtered to touched files), `npm run build`, and explicit manual browser checks — the project's established verification standard.

> **Source of truth:** MyJKKN's staff module owns `staff`. This module is **read-only** (no Add/Edit/Delete). Driver value confirmed: `staff.role_key = 'driver'` → 30 rows. The user-scoped read is done with the **service-role** client (gated by `withAuth`) to avoid `staff` RLS uncertainty.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `components/ui/table.tsx` (new) | shadcn table primitives (presentational) |
| `components/ui/dropdown-menu.tsx` (new) | Radix dropdown wrapper (column-visibility menu) |
| `components/ui/data-table.tsx` (new) | Generic `DataTable<TData,TValue>` — all table logic, reusable |
| `app/(admin)/drivers/columns.tsx` (new) | `ColumnDef<DriverListItem>[]` — driver-specific columns |
| `app/(admin)/drivers/driver-details-dialog.tsx` (new) | Read-only details view |
| `app/(admin)/drivers/page.tsx` (rewrite) | Header + stat cards + `<DataTable>` + React Query |
| `app/api/admin/drivers/route.ts` (rewrite) | `GET` → staff mapping; remove `POST`/`PUT` |
| `types/index.ts` (modify) | Add `DriverListItem`; remove `Driver`/`DriverFormData` (grep-guarded) |
| `package.json` (modify) | Add `@tanstack/react-table`, `@radix-ui/react-dropdown-menu` |

**Left untouched (impact-checked):** `lib/database.ts` (shared by 21 files), `app/api/admin/drivers/location/[driverId]/route.ts`, `app/api/admin/drivers/[driverId]/route-assignments/route.ts` (referenced by staff-route-assignments). These become dead-but-harmless; removing them is a separate cleanup.

---

## Task 1: Install dependencies

**Files:** Modify `package.json` (+ lockfile)

- [ ] **Step 1: Install**

Run:
```bash
npm install @tanstack/react-table @radix-ui/react-dropdown-menu
```

- [ ] **Step 2: Verify install**

Run: `node -e "require('@tanstack/react-table');require('@radix-ui/react-dropdown-menu');console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(drivers): add @tanstack/react-table + radix dropdown-menu"
```

---

## Task 2: Add shadcn primitives (`table`, `dropdown-menu`)

**Files:**
- Create: `components/ui/table.tsx`
- Create: `components/ui/dropdown-menu.tsx`

> First open `components/ui/button.tsx` and copy its exact `cn` import line (e.g. `import { cn } from '@/lib/utils'`). Use that SAME import path in both files below.

- [ ] **Step 1: Create `components/ui/table.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b transition-colors hover:bg-gray-50 data-[state=selected]:bg-gray-100',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-11 px-3 text-left align-middle font-medium text-gray-500 text-xs uppercase tracking-wide',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-3 py-3 align-middle', className)} {...props} />
));
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
```

- [ ] **Step 2: Create `components/ui/dropdown-menu.tsx`**

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
      className={cn(
        'z-50 min-w-[12rem] overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-md',
        className
      )}
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
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-gray-100',
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-xs font-semibold text-gray-500', className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
};
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "components/ui/(table|dropdown-menu)" || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 4: Commit**

```bash
git add components/ui/table.tsx components/ui/dropdown-menu.tsx
git commit -m "feat(ui): add shadcn table + dropdown-menu primitives"
```

---

## Task 3: Add generic `DataTable`

**Files:** Create `components/ui/data-table.tsx`

- [ ] **Step 1: Create `components/ui/data-table.tsx`**

```tsx
'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, Search } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface DataTableFilter {
  columnId: string;
  title: string;
  options: { label: string; value: string }[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  /** Column ids included in the global search box. */
  globalSearch?: boolean;
  /** Per-column select filters. */
  filters?: DataTableFilter[];
  pageSize?: number;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = 'Search...',
  globalSearch = true,
  filters = [],
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data,
    columns,
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
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          {globalSearch && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="input pl-10 w-full"
              />
            </div>
          )}
          {filters.map((f) => (
            <select
              key={f.columnId}
              className="input w-full sm:w-auto"
              value={(table.getColumn(f.columnId)?.getFilterValue() as string) ?? ''}
              onChange={(e) =>
                table.getColumn(f.columnId)?.setFilterValue(e.target.value || undefined)
              }
            >
              <option value="">{f.title}: All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Columns <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
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
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-gray-500">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {table.getFilteredRowModel().rows.length} row(s)
        </p>
        <div className="flex items-center gap-2">
          <select
            className="input"
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[10, 20, 30, 50].map((s) => (
              <option key={s} value={s}>
                {s} / page
              </option>
            ))}
          </select>
          <button
            className="btn-secondary disabled:opacity-50"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>
          <button
            className="btn-secondary disabled:opacity-50"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep "components/ui/data-table" || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 3: Commit**

```bash
git add components/ui/data-table.tsx
git commit -m "feat(ui): add generic TanStack DataTable component"
```

---

## Task 4: Add `DriverListItem` type + rewrite drivers API (read-only)

**Files:**
- Modify: `types/index.ts` (add `DriverListItem`)
- Rewrite: `app/api/admin/drivers/route.ts`

- [ ] **Step 1: Add `DriverListItem` to `types/index.ts`**

Add near the top, after the `UserRole` / `TmsUser` block:

```ts
// A driver-role user sourced (read-only) from the MyJKKN `staff` table.
export interface DriverListItem {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  designation: string;
  phone: string;
  email: string;
  employmentType: string;
  status: string;
  isActive: boolean;
  dateOfJoining: string | null;
  avatarUrl: string | null;
  institutionId: string;
  profileId: string | null;
}
```

- [ ] **Step 2: Rewrite `app/api/admin/drivers/route.ts`**

Replace the ENTIRE file with:

```ts
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { DriverListItem } from '@/types';

interface StaffRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  employment_type: string | null;
  status: string | null;
  is_active: boolean | null;
  date_of_joining: string | null;
  profile_picture: string | null;
  institution_id: string;
  profile_id: string | null;
}

// Pure mapping: staff row -> DriverListItem (exported for clarity/testing).
export function mapStaffToDriver(s: StaffRow): DriverListItem {
  const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
  return {
    id: s.id,
    name: name || (s.email ?? 'Unknown'),
    firstName: s.first_name ?? '',
    lastName: s.last_name ?? '',
    designation: s.designation ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    employmentType: s.employment_type ?? '',
    status: s.status ?? '',
    isActive: s.is_active ?? false,
    dateOfJoining: s.date_of_joining,
    avatarUrl: s.profile_picture,
    institutionId: s.institution_id,
    profileId: s.profile_id,
  };
}

async function getDrivers() {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('staff')
      .select(
        'id, first_name, last_name, designation, phone, email, employment_type, status, is_active, date_of_joining, profile_picture, institution_id, profile_id'
      )
      .eq('role_key', 'driver')
      .order('first_name', { ascending: true });

    if (error) {
      console.error('Drivers (staff) query error:', error);
      return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
    }

    const drivers = (data as StaffRow[]).map(mapStaffToDriver);
    return NextResponse.json({ success: true, data: drivers, count: drivers.length });
  } catch (e) {
    console.error('Drivers API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(() => getDrivers());
```

> NOTE: This removes the previous `POST`/`PUT` exports (read-only module). The sibling sub-routes (`location/[driverId]`, `[driverId]/route-assignments`) are intentionally left in place.

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "api/admin/drivers/route|types/index" || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 4: Manual data check (dev server running)**

Run dev (`npm run dev`), sign in as super_admin, then in the browser console on any admin page:
```js
fetch('/api/admin/drivers').then(r => r.json()).then(d => console.log(d.count, d.data[0]))
```
Expected: `count` = 30 (or current driver count), first object has `name`, `email`, `designation` populated.

- [ ] **Step 5: Commit**

```bash
git add types/index.ts app/api/admin/drivers/route.ts
git commit -m "feat(drivers): read-only drivers API sourced from staff (role_key=driver)"
```

---

## Task 5: Add driver columns + details dialog

**Files:**
- Create: `app/(admin)/drivers/columns.tsx`
- Create: `app/(admin)/drivers/driver-details-dialog.tsx`

- [ ] **Step 1: Create `app/(admin)/drivers/driver-details-dialog.tsx`**

```tsx
'use client';

import type { DriverListItem } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value || '—'}</span>
    </div>
  );
}

export function DriverDetailsDialog({
  driver,
  open,
  onOpenChange,
}: {
  driver: DriverListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Driver Details</DialogTitle>
        </DialogHeader>
        {driver && (
          <div className="space-y-1">
            <div className="flex items-center gap-3 pb-3">
              {driver.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={driver.avatarUrl} alt={driver.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                  {driver.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900">{driver.name}</p>
                <p className="text-sm text-gray-500">{driver.designation}</p>
              </div>
            </div>
            <Row label="Email" value={driver.email} />
            <Row label="Phone" value={driver.phone} />
            <Row label="Employment Type" value={driver.employmentType} />
            <Row label="Status" value={driver.status} />
            <Row label="Active" value={driver.isActive ? 'Yes' : 'No'} />
            <Row label="Date of Joining" value={driver.dateOfJoining ?? '—'} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

> Before writing the columns file, open `components/ui/dialog.tsx` and confirm it exports `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`. If the export names differ, adjust the import above to match.

- [ ] **Step 2: Create `app/(admin)/drivers/columns.tsx`**

```tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Eye } from 'lucide-react';
import type { DriverListItem } from '@/types';

function StatusBadge({ value }: { value: string }) {
  const v = value?.toLowerCase();
  const cls =
    v === 'active'
      ? 'bg-green-100 text-green-800'
      : v === 'draft'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-gray-100 text-gray-700';
  return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${cls}`}>{value || '—'}</span>;
}

export function getDriverColumns(
  onView: (driver: DriverListItem) => void
): ColumnDef<DriverListItem>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <button
          className="flex items-center gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: ({ row }) => {
        const d = row.original;
        return (
          <div className="flex items-center gap-3">
            {d.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.avatarUrl} alt={d.name} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-semibold">
                {d.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="font-medium text-gray-900">{d.name}</span>
          </div>
        );
      },
    },
    { accessorKey: 'designation', header: 'Designation' },
    { accessorKey: 'phone', header: 'Phone' },
    { accessorKey: 'email', header: 'Email' },
    {
      accessorKey: 'employmentType',
      header: 'Employment',
      cell: ({ row }) => (
        <span className="capitalize">{row.original.employmentType.replace(/_/g, ' ') || '—'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge value={row.original.status} />,
    },
    {
      accessorKey: 'isActive',
      header: 'Active',
      // Enable exact-match filtering by the string the filter <select> provides.
      filterFn: (row, id, value) => String(row.getValue(id)) === value,
      cell: ({ row }) => (
        <span
          className={`px-2 py-1 rounded-lg text-xs font-medium ${
            row.original.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {row.original.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      accessorKey: 'dateOfJoining',
      header: ({ column }) => (
        <button
          className="flex items-center gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Joined <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: ({ row }) => row.original.dateOfJoining ?? '—',
    },
    {
      id: 'actions',
      enableHiding: false,
      header: '',
      cell: ({ row }) => (
        <button
          onClick={() => onView(row.original)}
          className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
        >
          <Eye className="h-4 w-4" /> View
        </button>
      ),
    },
  ];
}
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "drivers/columns|drivers/driver-details-dialog" || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/drivers/columns.tsx" "app/(admin)/drivers/driver-details-dialog.tsx"
git commit -m "feat(drivers): driver column defs + read-only details dialog"
```

---

## Task 6: Rewrite the drivers page

**Files:** Rewrite `app/(admin)/drivers/page.tsx`

- [ ] **Step 1: Replace the ENTIRE file with**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, UserCheck } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { DataTable } from '@/components/ui/data-table';
import { getDriverColumns } from './columns';
import { DriverDetailsDialog } from './driver-details-dialog';

async function fetchDrivers(): Promise<DriverListItem[]> {
  const res = await fetch('/api/admin/drivers');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch drivers');
  return json.data as DriverListItem[];
}

export default function DriversPage() {
  const [viewing, setViewing] = useState<DriverListItem | null>(null);

  const { data: drivers = [], isLoading, isError } = useQuery({
    queryKey: ['drivers'],
    queryFn: fetchDrivers,
  });

  const columns = useMemo(() => getDriverColumns(setViewing), []);

  const total = drivers.length;
  const active = drivers.filter((d) => d.isActive).length;
  const inactive = total - active;
  const fullTime = drivers.filter((d) => d.employmentType === 'full_time').length;

  const stats = [
    { label: 'Total Drivers', value: total },
    { label: 'Active', value: active },
    { label: 'Inactive', value: inactive },
    { label: 'Full-time', value: fullTime },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
        <p className="text-gray-600">Driver-role staff from the MyJKKN staff directory (read-only)</p>
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
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
          <span className="text-gray-600">Loading drivers...</span>
        </div>
      ) : isError ? (
        <div className="text-center py-16">
          <UserCheck className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Failed to load drivers. Please retry.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={drivers}
          searchPlaceholder="Search name, email, phone..."
          filters={[
            {
              columnId: 'status',
              title: 'Status',
              options: [
                { label: 'Active', value: 'active' },
                { label: 'Draft', value: 'draft' },
              ],
            },
            {
              columnId: 'employmentType',
              title: 'Employment',
              options: [
                { label: 'Full-time', value: 'full_time' },
                { label: 'Part-time', value: 'part_time' },
              ],
            },
          ]}
        />
      )}

      <DriverDetailsDialog
        driver={viewing}
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
      />
    </div>
  );
}
```

> The global search box matches across all visible string columns by default (TanStack's built-in `includesString` global filter). Name, email, and phone are all columns, so they are covered.

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | grep -E "Compiled successfully|Failed|error occurred"`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Manual UI check (dev server)**

Sign in, open `/drivers`. Expected: 30 rows, stat cards populated, search filters rows, Status/Employment dropdowns filter, Name/Joined headers sort, pagination works, Columns toggle hides/shows, "View" opens the dialog.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/drivers/page.tsx"
git commit -m "feat(drivers): rewrite page as TanStack data table over staff drivers"
```

---

## Task 7: Remove obsolete driver modals + dead types (grep-guarded)

**Files:**
- Delete: `components/add-driver-modal.tsx`, `components/edit-driver-modal.tsx`, `components/driver-details-modal.tsx`, `components/driver-location-modal.tsx`
- Modify: `types/index.ts` (remove `Driver`, `DriverFormData` — only if unreferenced)

- [ ] **Step 1: Confirm modals are only referenced by the (now rewritten) page**

Run:
```bash
grep -rEl "add-driver-modal|edit-driver-modal|driver-details-modal|driver-location-modal" app components lib --include=*.ts --include=*.tsx
```
Expected: only the four modal files themselves (self/internal). The rewritten `drivers/page.tsx` no longer imports them. If any OTHER file imports them, STOP and update that file first.

- [ ] **Step 2: Delete the four modals**

```bash
git rm components/add-driver-modal.tsx components/edit-driver-modal.tsx components/driver-details-modal.tsx components/driver-location-modal.tsx
```

- [ ] **Step 3: Check whether `Driver` / `DriverFormData` types are still used**

Run:
```bash
grep -rEn "\bDriver\b|\bDriverFormData\b" app components lib --include=*.ts --include=*.tsx | grep -v "DriverListItem" | grep -v "DriverCard\|DriverDetails\|getDriverColumns\|fetchDrivers\|DriversPage\|driver-details-dialog"
```
Expected: no matches. **If matches remain, do NOT remove the types** — leave them and note it; otherwise proceed.

- [ ] **Step 4: If Step 3 was clean, remove the `Driver` and `DriverFormData` interfaces from `types/index.ts`**

Delete the `export interface Driver { ... }` block and the `export interface DriverFormData { ... }` block. Leave all other types intact.

- [ ] **Step 5: Verify build + no dangling imports**

Run: `npm run build 2>&1 | grep -E "Compiled successfully|Failed|error occurred|Module not found"`
Expected: `✓ Compiled successfully` (no "Module not found").

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(drivers): remove obsolete driver modals and dead types"
```

---

## Task 8: Final verification

- [ ] **Step 1: Type-check whole project (touched files clean)**

Run: `npx tsc --noEmit 2>&1 | grep -E "drivers|data-table|components/ui/(table|dropdown-menu)" || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 2: Production build**

Run: `npm run build 2>&1 | grep -E "Compiled successfully|Failed|error occurred"`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Manual end-to-end**

`/drivers`: 30 rows; search by name/email/phone; filter by Status + Employment; sort Name + Joined; toggle columns; paginate; "View" dialog shows correct details. Sidebar "Drivers" entry still gated by `tms.drivers.view`.

- [ ] **Step 4: Confirm no stray references**

Run: `grep -rEl "from '@/components/(add|edit)-driver-modal'|driver-location-modal|driver-details-modal" app components lib --include=*.tsx || echo CLEAN`
Expected: `CLEAN`

---

## Self-Review (completed during authoring)

- **Spec coverage:** read-only listing (Task 4/6), staff fields only (Task 4 mapping), Standard table features — search/sort/filter/pagination/column-visibility/details (Tasks 3/5/6), no institution scoping (Task 4 query has no institution filter), removal scope narrowed per impact check (Task 7), deps (Task 1). ✓
- **Placeholders:** none — every code step has complete code. ✓
- **Type consistency:** `DriverListItem` defined in Task 4 and used identically in Tasks 5/6; `getDriverColumns(onView)` signature matches its call in Task 6; `DataTable` props (`columns`, `data`, `searchPlaceholder`, `filters`) match usage. ✓
- **Deviation from spec (intentional, evidence-based):** `lib/database.ts` left untouched (shared by 21 files) and the `location`/`route-assignments` sub-routes retained (referenced by staff-route-assignments) — both downgraded from "remove" to "leave" after the impact grep.
