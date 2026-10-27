'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MapPin, MoreHorizontal, Navigation, Pencil, Trash2, Users } from 'lucide-react';
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

// Loose shape of an (enhanced) route row coming from /api/admin/routes.
export interface RouteRow {
  id: string;
  route_number: string;
  route_name: string;
  start_location?: string;
  end_location?: string;
  departure_time?: string;
  arrival_time?: string;
  distance?: number | string;
  duration?: string;
  total_capacity?: number;
  current_passengers?: number;
  _learnerCount?: number;
  _staffCount?: number;
  fare?: number | string;
  status?: string;
  route_stops?: unknown[];
  drivers?: { name?: string } | null;
  vehicles?: { registration_number?: string } | null;
  start_latitude?: number | null;
  start_longitude?: number | null;
  // Joined by /api/admin/routes for the Bus / Driver / Occupancy columns.
  _busNumber?: string | null;
  _busMissing?: boolean;
  _busCapacity?: number | null;
  _busLastGps?: string | null;
  _driverName?: string | null;
}

export const routeRiders = (r: RouteRow) => (r._learnerCount ?? 0) + (r._staffCount ?? 0);

/** 'none' | 'missing' | 'ok' — used by the "No bus" card filter. */
export const routeBusState = (r: RouteRow) => (r._busNumber ? 'ok' : r._busMissing ? 'missing' : 'none');

/** A bus counts as reporting when its last GPS fix is under 5 minutes old (Track All's "Live"). */
export const isBusReporting = (r: RouteRow, now = Date.now()) =>
  !!r._busLastGps && now - new Date(r._busLastGps).getTime() < 5 * 60_000;

// Riders against the bus's seats, as a bar. No seats known -> riders only.
function OccupancyCell({ r }: { r: RouteRow }) {
  const riders = routeRiders(r);
  const seats = r._busCapacity ?? 0;
  if (!seats) return <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">{riders} riders</span>;
  const pct = Math.round((riders / seats) * 100);
  const bar = pct > 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="w-28" title={`${riders} riders on ${seats} seats (${pct}%)`}>
      <div className="flex justify-between text-xs tabular-nums text-gray-600 dark:text-gray-300">
        <span>{riders}/{seats}</span>
        <span className={pct > 100 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        <div className={`h-full ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

const fmtTime = (t?: string) => (t ? t.slice(0, 5) : '—'); // 'HH:MM:SS' → 'HH:MM'

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
    inactive: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  };
  const cls = map[status ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status ?? 'unknown'}
    </span>
  );
}

export function getRouteColumns(
  onView: (r: RouteRow) => void,
  onEdit: (r: RouteRow) => void,
  onDelete: (r: RouteRow) => void,
  onTrack: (r: RouteRow) => void,
  canManage: boolean,
  canDelete: boolean
): ColumnDef<RouteRow>[] {
  const selectColumn: ColumnDef<RouteRow> = {
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
      accessorKey: 'route_number',
      meta: { label: 'Route no.' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route #" />,
      size: 90,
      cell: ({ row }) => (
        <span className="font-semibold text-gray-900 dark:text-gray-100">{row.original.route_number}</span>
      ),
    },
    {
      accessorKey: 'route_name',
      meta: { label: 'Name' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <Link
          href={`/routes/${row.original.id}`}
          className="font-medium text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
        >
          {row.original.route_name}
        </Link>
      ),
    },
    {
      id: 'journey',
      meta: { label: 'Journey' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Journey" />,
      accessorFn: (r) => `${r.start_location ?? ''} ${r.end_location ?? ''}`,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate">{row.original.start_location || '—'}</span>
          <span className="text-gray-400">→</span>
          <span className="truncate">{row.original.end_location || '—'}</span>
        </span>
      ),
    },
    {
      id: 'timing',
      meta: { label: 'Timing' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Timing" />,
      accessorFn: (r) => r.departure_time ?? '',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
          {fmtTime(row.original.departure_time)} – {fmtTime(row.original.arrival_time)}
        </span>
      ),
    },
    {
      id: 'distance',
      meta: { label: 'Distance' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Distance" />,
      accessorFn: (r) => Number(r.distance) || 0,
      size: 100,
      cell: ({ row }) => {
        const d = Number(row.original.distance);
        return (
          <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">
            {d > 0 ? `${d} km` : '—'}
          </span>
        );
      },
    },
    {
      id: 'duration',
      meta: { label: 'Travel time' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Travel time" />,
      accessorFn: (r) => r.duration ?? '',
      enableSorting: false,
      size: 110,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
          {row.original.duration?.trim() || '—'}
        </span>
      ),
    },
    {
      id: 'fare',
      meta: { label: 'Fare' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fare" />,
      accessorFn: (r) => Number(r.fare) || 0,
      size: 100,
      cell: ({ row }) => {
        const f = Number(row.original.fare);
        return (
          <span className="tabular-nums text-sm text-gray-600 dark:text-gray-300">
            {f > 0 ? `₹${f}` : '—'}
          </span>
        );
      },
    },
    {
      id: 'stops',
      meta: { label: 'Stops' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stops" />,
      accessorFn: (r) => r.route_stops?.length ?? 0,
      size: 80,
      cell: ({ row }) => <span className="tabular-nums">{row.original.route_stops?.length ?? 0}</span>,
    },
    {
      id: 'passengers',
      meta: { label: 'Passengers' },
      // Combined count = learners + staff. Clicking it opens the combined roster
      // (both lists) at /routes/[id]/passengers.
      header: ({ column }) => <DataTableColumnHeader column={column} title="Passengers" />,
      accessorFn: (r) => (r._learnerCount ?? 0) + (r._staffCount ?? 0),
      size: 110,
      cell: ({ row }) => {
        const total = (row.original._learnerCount ?? 0) + (row.original._staffCount ?? 0);
        return (
          <Link
            href={`/routes/${row.original.id}/passengers`}
            className="inline-flex items-center gap-1.5 tabular-nums font-medium text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
            title="View passengers (learners + staff) on this route"
          >
            <Users className="h-3.5 w-3.5 text-gray-400" />
            {total}
          </Link>
        );
      },
    },
    {
      id: 'bus',
      meta: { label: 'Bus' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      accessorFn: (r) => r._busNumber ?? '',
      filterFn: (row, _id, value) => routeBusState(row.original) === value || (value === 'none' && routeBusState(row.original) === 'missing'),
      cell: ({ row }) => {
        const r = row.original;
        if (r._busNumber) return <span className="whitespace-nowrap font-medium text-gray-800 dark:text-gray-200">{r._busNumber}</span>;
        return r._busMissing ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400" title="The route points at a bus that no longer exists — pick a bus in Edit">
            Missing bus
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">No bus</span>
        );
      },
    },
    {
      id: 'driver',
      meta: { label: 'Driver' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Driver" />,
      accessorFn: (r) => r._driverName ?? '',
      filterFn: (row, _id, value) => (value === 'none' ? !row.original._driverName : true),
      cell: ({ row }) =>
        row.original._driverName ? (
          <span className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{titleCase(row.original._driverName)}</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">No driver</span>
        ),
    },
    {
      id: 'occupancy',
      meta: { label: 'Occupancy' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Occupancy" />,
      accessorFn: (r) => (r._busCapacity ? routeRiders(r) / r._busCapacity : -1),
      // 'over' (card) = more riders than seats.
      filterFn: (row, id, value) => (value === 'over' ? (row.getValue(id) as number) > 1 : true),
      cell: ({ row }) => <OccupancyCell r={row.original} />,
    },
    {
      id: 'status',
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (r) => r.status ?? '',
      filterFn: (row, id, value) => (row.getValue(id) as string) === value,
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 60,
      header: () => <div className="text-right font-medium text-gray-500">Action</div>,
      cell: ({ row }) => {
        const r = row.original;
        const open = (fn: (r: RouteRow) => void) => setTimeout(() => fn(r), 0);
        const hasGps = !!(r.start_latitude && r.start_longitude);
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label={`Actions for route ${r.route_number}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuLabel>Action</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => open(onView)}>
                  <Eye className="text-gray-500" /> View details
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onSelect={() => open(onEdit)}>
                    <Pencil className="text-gray-500" /> Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => open(onTrack)} disabled={!hasGps}>
                  <Navigation className="text-gray-500" /> Live track
                </DropdownMenuItem>
                {canDelete && (
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
    },
  ];
}
