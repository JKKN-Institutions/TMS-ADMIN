'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Bus, Eye, MoreHorizontal, Pencil } from 'lucide-react';
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
import { PhoneLink } from '@/components/ui/display-bits';
import { titleCase } from '@/lib/format/display';

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
  onView: (l: LearnerPassenger) => void,
  /** Opens the Assign route dialog; omitted when the user can't allocate. */
  onAssign?: (l: LearnerPassenger) => void
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
      meta: { label: 'Name' },
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
                {titleCase(l.name)}
              </p>
              {l.email ? <p className="truncate text-xs text-gray-500">{l.email}</p> : null}
            </div>
          </Link>
        );
      },
    },
    {
      id: 'identifier',
      meta: { label: 'Roll / Reg no.' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Roll / Reg No." />,
      accessorFn: (l) => l.rollNumber ?? l.registerNumber ?? '',
      cell: ({ row }) => row.original.rollNumber ?? row.original.registerNumber ?? '—',
    },
    {
      accessorKey: 'mobile',
      meta: { label: 'Mobile' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mobile" />,
      cell: ({ row }) => <PhoneLink phone={row.original.mobile} />,
    },
    {
      id: 'institution',
      meta: { label: 'Institution' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      accessorFn: (l) => l.institutionName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600">{row.original.institutionName || '—'}</span>,
    },
    {
      id: 'department',
      meta: { label: 'Department' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
      accessorFn: (l) => l.departmentName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600">{row.original.departmentName || '—'}</span>,
    },
    {
      id: 'lifecycle',
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (l) => l.lifecycleStatus ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <LifecycleBadge status={row.original.lifecycleStatus} />,
    },
    {
      id: 'route',
      meta: { label: 'Route' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (l) => l.routeLabel ?? '',
      cell: ({ row }) => row.original.routeLabel || '—',
    },
    {
      id: 'stop',
      meta: { label: 'Boarding stop' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Boarding Stop" />,
      accessorFn: (l) => l.stopLabel ?? '',
      cell: ({ row }) => row.original.stopLabel || '—',
    },
    {
      id: 'assigned',
      meta: { label: 'Assignment' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Assignment" />,
      accessorFn: (l) => (l.assigned ? 'assigned' : 'unassigned'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <AssignedBadge assigned={row.original.assigned} />,
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 170,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const l = row.original;
        const open = (fn: (l: LearnerPassenger) => void) => setTimeout(() => fn(l), 0);
        return (
          <div className="flex items-center justify-end gap-1">
            {/* The common job — giving an unassigned learner a bus — is one click. */}
            {onAssign && !l.assigned && (
              <button
                type="button"
                onClick={() => onAssign(l)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
              >
                <Bus className="h-3.5 w-3.5" /> Assign route
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${titleCase(l.name)}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(onView)}>
                  <Eye className="text-gray-500" /> View learner
                </DropdownMenuItem>
                {onAssign && (
                  <DropdownMenuItem onSelect={() => open(onAssign)}>
                    {l.assigned ? <Pencil className="text-gray-500" /> : <Bus className="text-gray-500" />}
                    {l.assigned ? 'Change route' : 'Assign route'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
