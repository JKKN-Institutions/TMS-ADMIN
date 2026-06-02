'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal } from 'lucide-react';
import type { StaffPassenger } from '@/lib/passengers/types';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function ActiveBadge({ isActive }: { isActive: boolean }) {
  const cls = isActive
    ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function AssignedBadge({ assigned }: { assigned: boolean }) {
  return assigned ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> Assigned
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> Unassigned
    </span>
  );
}

export function getStaffColumns(
  onView: (s: StaffPassenger) => void
): ColumnDef<StaffPassenger>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <Link href={`/passengers/staff/${s.id}`} className="group flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-600 dark:bg-green-500/20 dark:text-green-300">
              {s.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 group-hover:text-green-600 group-hover:underline">
                {s.name}
              </p>
              {s.designation ? <p className="truncate text-xs text-gray-500">{s.designation}</p> : null}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'staffId',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff ID" />,
      cell: ({ row }) => row.original.staffId || '—',
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => <span className="text-gray-600">{row.original.email || '—'}</span>,
    },
    {
      accessorKey: 'phone',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) => row.original.phone || '—',
    },
    {
      id: 'institution',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      accessorFn: (s) => s.institutionName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600">{row.original.institutionName || '—'}</span>,
    },
    {
      id: 'department',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
      accessorFn: (s) => s.departmentName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600">{row.original.departmentName || '—'}</span>,
    },
    {
      id: 'activeStatus',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (s) => (s.isActive ? 'active' : 'inactive'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <ActiveBadge isActive={row.original.isActive} />,
    },
    {
      id: 'route',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (s) => s.routeLabel ?? '',
      cell: ({ row }) => row.original.routeLabel || '—',
    },
    {
      id: 'stop',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Boarding Stop" />,
      accessorFn: (s) => s.stopLabel ?? '',
      cell: ({ row }) => row.original.stopLabel || '—',
    },
    {
      id: 'assigned',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Assignment" />,
      accessorFn: (s) => (s.assigned ? 'assigned' : 'unassigned'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <AssignedBadge assigned={row.original.assigned} />,
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 80,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const s = row.original;
        const open = (fn: (s: StaffPassenger) => void) => setTimeout(() => fn(s), 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${s.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(onView)}>
                  <Eye className="text-gray-500" /> View
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
