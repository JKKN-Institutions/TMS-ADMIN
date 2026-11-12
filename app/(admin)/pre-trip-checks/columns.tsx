'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Bus, Check, Eye, X } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { PRE_TRIP_ITEMS, issueLabels } from '@/lib/tracking/pre-trip-check';
import { PRE_TRIP_STATUS_LABEL, type PreTripDayRow, type PreTripStatus } from '@/lib/tracking/pre-trip-admin';

// Solid pills, as on the Daily Report. Each shade keeps white text readable.
export const PRE_TRIP_STATUS_TONE: Record<PreTripStatus, string> = {
  ok: 'bg-green-600 text-white',
  issue: 'bg-red-600 text-white',
  skipped: 'bg-amber-700 text-white',
  not_done: 'bg-slate-500 text-white',
};

const DASH = <span className="text-muted-foreground">—</span>;

/** Short labels for the six ticks, in checklist order. */
const SHORT: Record<string, string> = {
  tyres_ok: 'Tyres',
  brakes_ok: 'Brakes',
  lights_ok: 'Lights',
  horn_ok: 'Horn',
  fuel_level_ok: 'Fuel',
  first_aid_box_ok: 'First-aid',
};

export function checkTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
}

/** What the Status column says under the pill: the failed items or the skip reason. */
export function statusDetail(r: PreTripDayRow): string | null {
  if (!r.check) return null;
  if (r.status === 'skipped') return r.check.skipReason ?? 'No reason given';
  if (r.status === 'issue') return issueLabels(r.check.items).join(', ') || null;
  return null;
}

export function getPreTripColumns(onView: (row: PreTripDayRow) => void): ColumnDef<PreTripDayRow>[] {
  return [
    {
      id: 'route',
      // Number, name, bus and driver together, so the search box finds any of them.
      accessorFn: (r) =>
        [r.routeNumber, r.routeName, r.busRegistration, r.driverName].filter(Boolean).join(' '),
      sortingFn: (x, y) =>
        (x.original.routeNumber ?? '￿').localeCompare(y.original.routeNumber ?? '￿', undefined, { numeric: true }),
      enableHiding: false,
      meta: { label: 'Route No' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route No" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300">
            <Bus className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="font-semibold tabular-nums text-foreground">{row.original.routeNumber ?? '—'}</span>
        </span>
      ),
    },
    {
      id: 'routeName',
      accessorFn: (r) => r.routeName ?? '',
      enableGlobalFilter: false,
      meta: { label: 'Route name' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route name" />,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.routeName) return <span className="text-xs text-amber-700 dark:text-amber-300">Route not found</span>;
        return (
          <span className="block max-w-[15rem] truncate text-foreground" title={r.routeName}>
            {r.routeName}
          </span>
        );
      },
    },
    {
      id: 'bus',
      accessorFn: (r) => r.busRegistration ?? '',
      enableGlobalFilter: false,
      meta: { label: 'Bus' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      cell: ({ row }) =>
        row.original.busRegistration ? (
          <span className="whitespace-nowrap font-medium tabular-nums text-foreground">{row.original.busRegistration}</span>
        ) : (
          DASH
        ),
    },
    {
      id: 'driver',
      accessorFn: (r) => r.driverName ?? '',
      enableGlobalFilter: false,
      meta: { label: 'Driver' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Driver" />,
      cell: ({ row }) =>
        row.original.driverName ? (
          <span className="block max-w-[12rem] truncate text-foreground" title={row.original.driverName}>
            {row.original.driverName}
          </span>
        ) : (
          <span className="whitespace-nowrap text-xs font-medium text-red-600 dark:text-red-400">No driver</span>
        ),
    },
    {
      id: 'status',
      accessorFn: (r) => r.status,
      enableGlobalFilter: false,
      filterFn: (row, id, value: string[] | string) =>
        Array.isArray(value) ? value.includes(row.getValue(id)) : row.getValue(id) === value,
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const r = row.original;
        const detail = statusDetail(r);
        return (
          <div>
            <span
              className={`inline-flex min-w-[5.5rem] justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${PRE_TRIP_STATUS_TONE[r.status]}`}
            >
              {PRE_TRIP_STATUS_LABEL[r.status]}
            </span>
            {detail && (
              <span className="mt-0.5 block max-w-[11rem] truncate text-xs text-muted-foreground" title={detail}>
                {detail}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'checklist',
      accessorFn: (r) => (r.check ? issueLabels(r.check.items).length : -1),
      enableGlobalFilter: false,
      enableSorting: false,
      meta: { label: 'Checklist' },
      header: () => <span>Checklist</span>,
      cell: ({ row }) => {
        const c = row.original.check;
        if (!c || c.skipped) return DASH;
        return (
          <span className="inline-flex gap-1" role="list" aria-label="Checklist answers">
            {PRE_TRIP_ITEMS.map(({ key, label }) => {
              const ok = c.items[key] === true;
              return (
                <span
                  key={key}
                  role="listitem"
                  title={`${label}: ${ok ? 'OK' : 'NOT OK'}`}
                  aria-label={`${label}: ${ok ? 'OK' : 'not OK'}`}
                  className={`flex h-6 items-center gap-0.5 rounded-md px-1.5 text-[11px] font-medium ${
                    ok
                      ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300'
                      : 'bg-red-600 text-white'
                  }`}
                >
                  {ok ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
                  {SHORT[key]}
                </span>
              );
            })}
          </span>
        );
      },
    },
    {
      id: 'odometer',
      accessorFn: (r) => r.check?.odometerKm ?? -1,
      enableGlobalFilter: false,
      meta: { label: 'Odometer' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Odometer" />,
      cell: ({ row }) => {
        const km = row.original.check?.odometerKm;
        return km == null ? DASH : <span className="whitespace-nowrap tabular-nums">{km.toLocaleString('en-IN')} km</span>;
      },
    },
    {
      id: 'time',
      accessorFn: (r) => r.check?.createdAt ?? '',
      enableGlobalFilter: false,
      meta: { label: 'Time' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Time" />,
      cell: ({ row }) =>
        row.original.check ? (
          <span className="whitespace-nowrap tabular-nums">{checkTime(row.original.check.createdAt)}</span>
        ) : (
          DASH
        ),
    },
    {
      id: 'details',
      enableSorting: false,
      enableHiding: false,
      enableGlobalFilter: false,
      meta: { label: 'Details' },
      header: () => <span>Details</span>,
      cell: ({ row }) =>
        row.original.check ? (
          <button
            type="button"
            onClick={() => onView(row.original)}
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            View
          </button>
        ) : (
          DASH
        ),
    },
  ];
}
