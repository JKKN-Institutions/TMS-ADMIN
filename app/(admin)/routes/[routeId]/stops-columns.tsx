'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';

export interface RouteStop {
  id: string;
  stop_name: string;
  stop_time: string; // morning / inbound (to-college) pickup
  evening_time?: string | null; // evening / outbound (from-college) drop
  sequence_order: number;
  is_major_stop: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : '—');

const hasCoords = (s: RouteStop) => s.latitude != null && s.longitude != null;

export const STOP_TYPE_OPTIONS = [
  { label: 'Major', value: 'major' },
  { label: 'Regular', value: 'regular' },
];

// Static: nothing here depends on page state, so one array serves every render.
export const stopColumns: ColumnDef<RouteStop>[] = [
  {
    accessorKey: 'sequence_order',
    meta: { label: '#' },
    size: 64,
    header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
    cell: ({ row }) => (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300">
        {row.original.sequence_order ?? row.index + 1}
      </span>
    ),
  },
  {
    accessorKey: 'stop_name',
    meta: { label: 'Stop' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Stop" />,
    cell: ({ row }) => (
      <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.stop_name}</span>
    ),
  },
  {
    accessorKey: 'stop_time',
    meta: { label: 'Morning' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Morning" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">{fmtTime(row.original.stop_time)}</span>
    ),
  },
  {
    id: 'evening_time',
    accessorFn: (s) => s.evening_time ?? '',
    meta: { label: 'Evening' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Evening" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">{fmtTime(row.original.evening_time)}</span>
    ),
  },
  {
    id: 'type',
    accessorFn: (s) => (s.is_major_stop ? 'major' : 'regular'),
    filterFn: (row, id, value) => (row.getValue(id) as string) === value,
    meta: { label: 'Type' },
    size: 110,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) =>
      row.original.is_major_stop ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
          Major
        </span>
      ) : (
        <span className="text-xs text-gray-400">Regular</span>
      ),
  },
  {
    id: 'coordinates',
    accessorFn: (s) => (hasCoords(s) ? `${s.latitude}, ${s.longitude}` : ''),
    meta: { label: 'Coordinates' },
    enableSorting: false,
    header: () => <span>Coordinates</span>,
    cell: ({ row }) => {
      const s = row.original;
      return hasCoords(s) ? (
        <span className="whitespace-nowrap font-mono text-xs text-gray-600 dark:text-gray-300">
          {Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)}
        </span>
      ) : (
        <span className="text-xs text-gray-400">Not set</span>
      );
    },
  },
];
