'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal } from 'lucide-react';
import type { LearnerPassenger } from '@/lib/passengers/types';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function LifecycleBadge({ status }: { status: string }) {
  // Greenish for the "live" states, neutral otherwise. Dark-mode aware.
  const live = ['active', 'account', 'admitted'].includes(status);
  const cls = live
    ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status.replace(/_/g, ' ') || '—'}
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

export function getLearnerColumns(
  onView: (l: LearnerPassenger) => void
): ColumnDef<LearnerPassenger>[] {
  return [
    {
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
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const l = row.original;
        return (
          <Link href={`/passengers/learners/${l.id}`} className="group flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-600 dark:bg-green-500/20 dark:text-green-300">
              {l.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 group-hover:text-green-600 group-hover:underline">
                {l.name}
              </p>
              {l.email ? <p className="truncate text-xs text-gray-500">{l.email}</p> : null}
            </div>
          </Link>
        );
      },
    },
    {
      id: 'identifier',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roll / Reg No." />,
      accessorFn: (l) => l.rollNumber ?? l.registerNumber ?? '',
      cell: ({ row }) => row.original.rollNumber ?? row.original.registerNumber ?? '—',
    },
    {
      accessorKey: 'mobile',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mobile" />,
      cell: ({ row }) => row.original.mobile || '—',
    },
    {
      id: 'institution',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      accessorFn: (l) => l.institutionName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600">{row.original.institutionName || '—'}</span>,
    },
    {
      id: 'department',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
      accessorFn: (l) => l.departmentName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600">{row.original.departmentName || '—'}</span>,
    },
    {
      id: 'lifecycle',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (l) => l.lifecycleStatus ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <LifecycleBadge status={row.original.lifecycleStatus} />,
    },
    {
      id: 'route',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (l) => l.routeLabel ?? '',
      cell: ({ row }) => row.original.routeLabel || '—',
    },
    {
      id: 'stop',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Boarding Stop" />,
      accessorFn: (l) => l.stopLabel ?? '',
      cell: ({ row }) => row.original.stopLabel || '—',
    },
    {
      id: 'assigned',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Assignment" />,
      accessorFn: (l) => (l.assigned ? 'assigned' : 'unassigned'),
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
        const l = row.original;
        const open = (fn: (l: LearnerPassenger) => void) => setTimeout(() => fn(l), 0);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${l.name}`}
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
