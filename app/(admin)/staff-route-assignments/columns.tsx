'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Clock, MapPin, MoreHorizontal, Route as RouteIcon, Trash2, Users } from 'lucide-react';
import { titleCase } from '@/lib/format/display';
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

// Route embedded on each assignment (joined from tms_route by the API).
export interface AssignmentRoute {
  id: string;
  route_number?: string;
  route_name?: string;
  start_location?: string;
  end_location?: string;
  departure_time?: string;
  arrival_time?: string;
  status?: string;
  // Derived by the API: riders counted live from real allocation, seats from the
  // route's assigned vehicle. The tms_route counter columns are dead (always 0)
  // and must not be rendered — see lib/passengers/route-roster.ts.
  passenger_count?: number;
  capacity?: number | null;
}

// Shape of an assignment row from /api/admin/staff-route-assignments.
export interface AssignmentRow {
  id: string;
  staff_email: string;
  /** Resolved by the API from staff.email / institution_email; null if unmatched. */
  staff_name?: string | null;
  staff_designation?: string | null;
  route_id: string;
  assigned_at: string;
  is_active: boolean;
  notes?: string | null;
  source?: 'admin' | 'self' | null;
  routes: AssignmentRoute | null;
}

/** Name for display; falls back to the email when the address matches no staff record. */
export const assignmentPerson = (a: AssignmentRow) => (a.staff_name ? titleCase(a.staff_name) : a.staff_email);

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export function getAssignmentColumns(
  onRemove: (a: AssignmentRow) => void,
  canManage: boolean
): ColumnDef<AssignmentRow>[] {
  const selectColumn: ColumnDef<AssignmentRow> = {
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
  };

  return [
    ...(canManage ? [selectColumn] : []),
    {
      // Name first (search also matches the email underneath).
      id: 'staff',
      meta: { label: 'Staff' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
      accessorFn: (a) => `${a.staff_name ?? ''} ${a.staff_email}`.trim(),
      cell: ({ row }) => {
        const a = row.original;
        return (
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-300">
              {(a.staff_name ?? a.staff_email).slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-gray-900 dark:text-gray-100">{assignmentPerson(a)}</span>
              <span className="block truncate text-xs text-gray-500">
                {a.staff_name ? [a.staff_designation, a.staff_email].filter(Boolean).join(' · ') : 'No matching staff record'}
              </span>
            </span>
          </span>
        );
      },
    },
    {
      // Route number + name. accessorFn so global search matches both.
      id: 'route',
      meta: { label: 'Route' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (a) => `${a.routes?.route_number ?? ''} ${a.routes?.route_name ?? ''}`.trim(),
      cell: ({ row }) => {
        const r = row.original.routes;
        if (!r) return <span className="text-gray-400">—</span>;
        return (
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/15">
              <RouteIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-gray-900 dark:text-gray-100">{r.route_name ?? '—'}</span>
              <span className="block font-mono text-xs text-gray-500">{r.route_number ?? '—'}</span>
            </span>
          </span>
        );
      },
    },
    {
      id: 'trip',
      meta: { label: 'Trip' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Trip" />,
      accessorFn: (a) => `${a.routes?.start_location ?? ''} ${a.routes?.end_location ?? ''}`.trim(),
      cell: ({ row }) => {
        const r = row.original.routes;
        if (!r?.start_location && !r?.end_location) return <span className="text-gray-400">—</span>;
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {r?.start_location ?? '—'} → {r?.end_location ?? '—'}
          </span>
        );
      },
    },
    {
      id: 'schedule',
      enableSorting: false,
      meta: { label: 'Schedule' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Schedule" />,
      cell: ({ row }) => {
        const r = row.original.routes;
        if (!r?.departure_time && !r?.arrival_time) return <span className="text-gray-400">—</span>;
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
            <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {r?.departure_time ?? '—'} – {r?.arrival_time ?? '—'}
          </span>
        );
      },
    },
    {
      id: 'passengers',
      enableSorting: false,
      meta: { label: 'Passengers' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Passengers" />,
      size: 120,
      cell: ({ row }) => {
        const r = row.original.routes;
        if (!r) return <span className="text-gray-400">—</span>;
        // Seats are unknown when the route has no vehicle assigned; show the
        // rider count alone rather than dividing by a fabricated 0.
        return (
          <span className="flex items-center gap-1.5 tabular-nums text-sm text-gray-600 dark:text-gray-300">
            <Users className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {r.passenger_count ?? 0}
            {r.capacity ? `/${r.capacity}` : ''}
          </span>
        );
      },
    },
    {
      accessorKey: 'source',
      meta: { label: 'Source' },
      filterFn: (row, id, value) => (row.getValue(id) === 'self' ? 'self' : 'admin') === value,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      size: 120,
      cell: ({ row }) => {
        const self = row.original.source === 'self';
        return (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              self
                ? 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300'
            }`}
          >
            {self ? 'Self-selected' : 'Admin'}
          </span>
        );
      },
    },
    {
      accessorKey: 'assigned_at',
      meta: { label: 'Assigned on' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Assigned" />,
      size: 120,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.original.assigned_at)}</span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const a = row.original;
        if (!canManage) return null;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for ${assignmentPerson(a)}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => onRemove(a), 0)}
                  className="text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10 [&>svg]:text-red-500"
                >
                  <Trash2 /> Remove assignment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
