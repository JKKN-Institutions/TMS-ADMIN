'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Pencil, Plus, XCircle } from 'lucide-react';
import type { LearnerPassenger } from '@/lib/passengers/types';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Allocation state pill. Greenish = has a route; amber = needs allocating.
// Dark-mode aware (solid colored tints need explicit dark: pairs in this app).
function AllocationBadge({ assigned }: { assigned: boolean }) {
  return assigned ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> Allocated
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> Unallocated
    </span>
  );
}

/**
 * Columns for the Transport Enrollment allocation table. Unlike a plain roster,
 * the actions here mutate allocation: a prominent Allocate/Change button opens
 * the allocation dialog, and a kebab carries the secondary actions (view the
 * learner, clear an existing allocation).
 */
export function getEnrollmentColumns(
  onAllocate: (l: LearnerPassenger) => void,
  onView: (l: LearnerPassenger) => void,
  onClear: (l: LearnerPassenger) => void
): ColumnDef<LearnerPassenger>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
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
      id: 'department',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
      accessorFn: (l) => l.departmentName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600">{row.original.departmentName || '—'}</span>,
    },
    {
      id: 'institution',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      accessorFn: (l) => l.institutionName ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <span className="text-gray-600">{row.original.institutionName || '—'}</span>,
    },
    {
      id: 'route',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (l) => l.routeLabel ?? '',
      cell: ({ row }) =>
        row.original.routeLabel ?? <span className="text-amber-600">Unallocated</span>,
    },
    {
      id: 'stop',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Boarding Stop" />,
      accessorFn: (l) => l.stopLabel ?? '',
      cell: ({ row }) => row.original.stopLabel || '—',
    },
    {
      id: 'assigned',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (l) => (l.assigned ? 'assigned' : 'unassigned'),
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => <AllocationBadge assigned={row.original.assigned} />,
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 150,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const l = row.original;
        // Defer dropdown callbacks a tick so Radix unmounts the menu before a
        // dialog/navigation grabs focus (the pointer-events / focus race).
        const open = (fn: (l: LearnerPassenger) => void) => setTimeout(() => fn(l), 0);
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => onAllocate(l)}
              className={
                l.assigned
                  ? 'inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800'
                  : 'inline-flex h-8 items-center gap-1.5 rounded-md bg-green-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-green-700'
              }
            >
              {l.assigned ? (
                <>
                  <Pencil className="h-3.5 w-3.5" /> Change
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Allocate
                </>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`More actions for ${l.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(onView)}>
                  <Eye className="text-gray-500" /> View learner
                </DropdownMenuItem>
                {l.assigned && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => open(onClear)}
                      className="text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10 [&>svg]:text-red-500"
                    >
                      <XCircle /> Clear allocation
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
