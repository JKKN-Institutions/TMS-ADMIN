'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { DriverListItem } from '@/types';
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const d = row.original;
        // Clicking the name opens the in-module view page.
        return (
          <Link href={`/drivers/${d.id}`} className="group flex items-center gap-3">
            {d.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.avatarUrl} alt={d.name} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
                {d.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 group-hover:text-blue-600 group-hover:underline">{d.name}</p>
              {d.designation ? <p className="truncate text-xs text-gray-500">{d.designation}</p> : null}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'phone',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) => row.original.phone || '—',
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => <span className="text-gray-600">{row.original.email || '—'}</span>,
    },
    {
      id: 'activeStatus',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (d) => (d.isActive ? 'active' : 'inactive'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <ActiveBadge isActive={row.original.isActive} />,
    },
    {
      id: 'licenseNumber',
      header: ({ column }) => <DataTableColumnHeader column={column} title="License No." />,
      accessorFn: (d) => d.ops?.licenseNumber ?? '',
      cell: ({ row }) => row.original.ops?.licenseNumber ?? '—',
    },
    {
      id: 'experienceYears',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Exp (yrs)" />,
      accessorFn: (d) => d.ops?.experienceYears ?? 0,
      cell: ({ row }) => (row.original.ops ? row.original.ops.experienceYears : '—'),
    },
    {
      accessorKey: 'employmentType',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Employment" />,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="capitalize">{row.original.employmentType.replace(/_/g, ' ') || '—'}</span>,
    },
    {
      accessorKey: 'dateOfJoining',
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={`Actions for ${d.name}`}
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
