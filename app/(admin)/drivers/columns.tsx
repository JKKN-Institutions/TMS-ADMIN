'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { ExpiryBadge, PhoneLink } from '@/components/ui/display-bits';
import { expiryState, titleCase } from '@/lib/format/display';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Active/Inactive reflects the staff account flag (driver.isActive), distinct from
// the operational "Driver Status" (active / on_leave / inactive).
function ActiveBadge({ isActive }: { isActive: boolean }) {
  const cls = isActive
    ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
    : 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

/** License health used by the "License missing / expiring" cards and the License column. */
export type LicenseState = 'missing' | 'no_expiry' | 'expired' | 'soon' | 'ok';

export function licenseState(d: DriverListItem): LicenseState {
  if (!d.ops?.licenseNumber?.trim()) return 'missing';
  const e = expiryState(d.ops.licenseExpiry);
  return e === 'missing' ? 'no_expiry' : e;
}

/** On duty = the driver is sharing location right now (the same signal Track All uses). */
export const isOnDuty = (d: DriverListItem) => !!d.ops?.locationSharingEnabled;

const eq = (row: { getValue: (id: string) => unknown }, id: string, value: string) => row.getValue(id) === value;

export function getDriverColumns(
  onView: (d: DriverListItem) => void,
  onEdit: (d: DriverListItem) => void,
  onDelete: (d: DriverListItem) => void,
  canManage: boolean
): ColumnDef<DriverListItem>[] {
  const cols: ColumnDef<DriverListItem>[] = [];

  if (canManage) {
    cols.push({
      id: 'select',
      enableSorting: false,
      enableHiding: false,
      size: 40,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(v)} aria-label="Select row" />
      ),
    });
  }

  cols.push(
    {
      accessorKey: 'name',
      meta: { label: 'Name' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const d = row.original;
        // Clicking the name opens the in-module view page.
        return (
          <Link href={`/drivers/${d.id}`} className="group flex items-center gap-3">
            {d.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.avatarUrl} alt={titleCase(d.name)} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-600 dark:bg-green-500/20 dark:text-green-300">
                {d.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 group-hover:text-green-600 group-hover:underline">{titleCase(d.name)}</p>
              {d.designation ? <p className="truncate text-xs text-gray-500">{d.designation}</p> : null}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'phone',
      meta: { label: 'Phone' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) => <PhoneLink phone={row.original.phone} />,
    },
    {
      accessorKey: 'email',
      meta: { label: 'Email' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => <span className="text-gray-600">{row.original.email || '—'}</span>,
    },
    {
      id: 'duty',
      meta: { label: 'Duty' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Duty" />,
      accessorFn: (d) => (isOnDuty(d) ? 'on' : 'off'),
      filterFn: (row, id, value) => eq(row, id, value),
      cell: ({ row }) =>
        isOnDuty(row.original) ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> On duty
          </span>
        ) : (
          <span className="text-xs text-gray-500">Off duty</span>
        ),
    },
    {
      id: 'activeStatus',
      meta: { label: 'Staff status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff status" />,
      accessorFn: (d) => (d.isActive ? 'active' : 'inactive'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <ActiveBadge isActive={row.original.isActive} />,
    },
    {
      id: 'route',
      meta: { label: 'Route' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (d) => d.routes.map((r) => r.label).join(', '),
      // Card filter "No route" sets value 'none'; free-text search still matches labels.
      filterFn: (row, _id, value) => (value === 'none' ? row.original.routes.length === 0 : true),
      cell: ({ row }) => {
        const routes = row.original.routes;
        if (routes.length === 0) return <span className="text-gray-400">—</span>;
        return (
          <span className="text-gray-700 dark:text-gray-300">
            {routes[0].label}
            {routes.length > 1 && (
              <span className="ml-1 text-xs text-gray-500">+{routes.length - 1}</span>
            )}
          </span>
        );
      },
    },
    {
      id: 'bus',
      meta: { label: 'Bus' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      accessorFn: (d) => d.routes.map((r) => r.bus).filter(Boolean).join(', '),
      cell: ({ row }) => {
        const buses = row.original.routes.map((r) => r.bus).filter(Boolean) as string[];
        if (buses.length === 0) return <span className="text-gray-400">—</span>;
        return <span className="font-medium text-gray-800 dark:text-gray-200">{buses.join(', ')}</span>;
      },
    },
    {
      id: 'licenseNumber',
      meta: { label: 'License no.' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="License No." />,
      accessorFn: (d) => d.ops?.licenseNumber ?? '',
      cell: ({ row }) =>
        row.original.ops?.licenseNumber?.trim() ? (
          row.original.ops.licenseNumber
        ) : (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
            No license on file
          </span>
        ),
    },
    {
      id: 'license',
      meta: { label: 'License expiry' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="License expiry" />,
      accessorFn: (d) => licenseState(d),
      // 'attention' (card) = expired or due within 60 days.
      filterFn: (row, id, value) => {
        const v = row.getValue(id) as LicenseState;
        return value === 'attention' ? v === 'expired' || v === 'soon' : v === value;
      },
      sortingFn: (a, b) => (a.original.ops?.licenseExpiry ?? '9999').localeCompare(b.original.ops?.licenseExpiry ?? '9999'),
      cell: ({ row }) =>
        licenseState(row.original) === 'missing' ? (
          <span className="text-gray-400">—</span>
        ) : (
          <ExpiryBadge date={row.original.ops?.licenseExpiry} missingLabel="No expiry date" />
        ),
    },
    {
      id: 'experienceYears',
      meta: { label: 'Experience' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Exp (yrs)" />,
      accessorFn: (d) => d.ops?.experienceYears ?? 0,
      cell: ({ row }) => (row.original.ops ? row.original.ops.experienceYears : '—'),
    },
    {
      accessorKey: 'employmentType',
      meta: { label: 'Employment' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employment" />,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="capitalize">{row.original.employmentType.replace(/_/g, ' ') || '—'}</span>,
    },
    {
      accessorKey: 'dateOfJoining',
      meta: { label: 'Joined' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => row.original.dateOfJoining ?? '—',
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 80,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const d = row.original;
        // Defer to the next tick so Radix finishes closing the menu before the
        // delete dialog grabs focus (avoids the pointer-events / focus race).
        const open = (fn: (d: DriverListItem) => void) => setTimeout(() => fn(d), 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${titleCase(d.name)}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(onView)}>
                  <Eye className="text-gray-500" /> View
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => open(onEdit)}>
                    <Pencil className="text-gray-500" /> Edit
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => open(onDelete)}
                      className="text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10 [&>svg]:text-red-500"
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }
  );

  return cols;
}
