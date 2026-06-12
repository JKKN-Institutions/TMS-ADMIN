'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Clock, Mail, MapPin, MoreHorizontal, Route as RouteIcon, Trash2, Users } from 'lucide-react';
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
  total_capacity?: number;
  current_passengers?: number;
}

// Shape of an assignment row from /api/admin/staff-route-assignments.
export interface AssignmentRow {
  id: string;
  staff_email: string;
  route_id: string;
  assigned_at: string;
  is_active: boolean;
  notes?: string | null;
  routes: AssignmentRoute | null;
}

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
      accessorKey: 'staff_email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff Email" />,
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/15">
            <Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </span>
          {row.original.staff_email}
        </span>
      ),
    },
    {
      // Route number + name. accessorFn so global search matches both.
      id: 'route',
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Passengers" />,
      size: 120,
      cell: ({ row }) => {
        const r = row.original.routes;
        if (!r) return <span className="text-gray-400">—</span>;
        return (
          <span className="flex items-center gap-1.5 tabular-nums text-sm text-gray-600 dark:text-gray-300">
            <Users className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {r.current_passengers ?? 0}/{r.total_capacity ?? 0}
          </span>
        );
      },
    },
    {
      accessorKey: 'assigned_at',
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
                  aria-label={`Actions for ${a.staff_email}`}
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
