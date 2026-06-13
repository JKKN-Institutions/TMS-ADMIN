'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, User } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Row shape from /api/admin/activity-log (tms_activity_log).
export interface ActivityRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  module: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  description: string | null;
  changes: { before?: unknown; after?: unknown } | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  delete: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  import: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  assign: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400',
  unassign: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  upload: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  activate: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  deactivate: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400',
  scan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  mark: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  generate: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
};

const MODULE_LABEL: Record<string, string> = {
  'drivers': 'Drivers',
  'vehicles': 'Vehicles',
  'routes': 'Routes',
  'gps-devices': 'GPS Devices',
  'passengers': 'Passengers',
  'staff-route-assignments': 'Staff Assignments',
  'boarding': 'Boarding',
  'transport-years': 'Transport Years',
  'enrollment': 'Enrollment',
  'grievances': 'Grievances',
  'settings': 'Settings',
  'fees': 'Fees',
};

// Filter dropdown options for the DataTable — derived from the maps above so
// the page can't drift out of sync with what the badges/labels support.
export const MODULE_OPTIONS = Object.entries(MODULE_LABEL).map(([value, label]) => ({ label, value }));
export const ACTION_OPTIONS = (Object.keys(ACTION_BADGE) as string[]).map((a) => ({
  label: a.charAt(0).toUpperCase() + a.slice(1),
  value: a,
}));

const fmtTime = (d: string) =>
  new Date(d).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

export function getActivityColumns(
  onView: (row: ActivityRow) => void
): ColumnDef<ActivityRow>[] {
  return [
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Time" />,
      size: 140,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-600 dark:text-gray-300">
          {fmtTime(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: 'actor_email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Actor" />,
      cell: ({ row }) => (
        <span className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/15">
            <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {row.original.actor_email ?? 'System'}
            </span>
            <span className="block text-xs text-gray-500">{row.original.actor_role ?? '—'}</span>
          </span>
        </span>
      ),
    },
    {
      accessorKey: 'module',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Module" />,
      size: 140,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => (
        <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-500/15 dark:text-gray-300">
          {MODULE_LABEL[row.original.module] ?? row.original.module}
        </span>
      ),
    },
    {
      accessorKey: 'action',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
      size: 110,
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      cell: ({ row }) => (
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
            ACTION_BADGE[row.original.action] ?? ACTION_BADGE.deactivate
          }`}
        >
          {row.original.action}
        </span>
      ),
    },
    {
      id: 'entity',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Entity" />,
      accessorFn: (r) => `${r.entity_label ?? ''} ${r.entity_type ?? ''}`.trim(),
      cell: ({ row }) => {
        const r = row.original;
        if (!r.entity_label && !r.entity_type) return <span className="text-gray-400">—</span>;
        return (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {r.entity_label ?? '—'}
            </span>
            <span className="block font-mono text-xs text-gray-500">{r.entity_type ?? ''}</span>
          </span>
        );
      },
    },
    {
      accessorKey: 'description',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-[320px] truncate text-sm text-gray-600 dark:text-gray-300">
          {row.original.description ?? '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                aria-label={`Actions for ${row.original.entity_label ?? row.original.action} entry`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuLabel>Action</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTimeout(() => onView(row.original), 0)}>
                <Eye /> View details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
}
