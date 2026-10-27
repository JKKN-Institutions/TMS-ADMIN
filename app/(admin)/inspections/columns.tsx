'use client';

import Link from 'next/link';
import type { ColumnDef, HeaderContext } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { titleCase } from '@/lib/format/display';
import { LEG_NAME } from '@/lib/boarding/attendance-window';
import type { CheckLeg, MyCheckRoute } from '@/lib/route-check/types';
import type { CheckListRow, InspectorRow } from './inspection-api';

export const LEG_LABEL: Record<'onward' | 'return', string> = { onward: 'Morning', return: 'Evening' };
const STATUS_BADGE: Record<'draft' | 'submitted', string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  submitted: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const eq = (row: { getValue: (id: string) => unknown }, id: string, value: unknown) => String(row.getValue(id)) === value;
const numCell = (n: number) => <div className="text-right tabular-nums text-gray-700 dark:text-gray-300">{n}</div>;
const numHeader = (title: string) => ({ column }: HeaderContext<CheckListRow, unknown>) => (
  <div className="flex justify-end">
    <DataTableColumnHeader column={column} title={title} />
  </div>
);

/** "21 · TN 28 AB 1234" — the route number with the bus or route name beside it. */
const routeLabel = (num: string | null, extra: string | null) => `${num ?? '—'}${extra ? ` · ${extra}` : ''}`;
export const inspectorName = (r: InspectorRow) => (r.checkerName ? titleCase(r.checkerName) : r.checkerEmail);

// ── Checks tab ────────────────────────────────────────────────────────────────
// `leg`, `status` and `route` carry id + accessorFn + filterFn so the tab's
// <DataTable filters> bind to them. The date links to the check's report.
export function getCheckColumns(from: string, to: string): ColumnDef<CheckListRow>[] {
  return [
    {
      accessorKey: 'checkDate',
      meta: { label: 'Date' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <Link
          href={`/inspections/checks/${row.original.id}?from=${from}&to=${to}`}
          className="whitespace-nowrap font-semibold text-gray-900 hover:text-green-600 hover:underline dark:text-gray-100"
        >
          {row.original.checkDate}
        </Link>
      ),
    },
    {
      id: 'route',
      meta: { label: 'Bus' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      accessorFn: (c) => routeLabel(c.routeNumber, c.busRegistration),
      filterFn: (row, _id, value) => (row.original.routeNumber ?? '') === value,
      cell: ({ getValue }) => <span className="text-gray-700 dark:text-gray-300">{getValue() as string}</span>,
    },
    {
      id: 'leg',
      meta: { label: 'Trip' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Trip" />,
      accessorFn: (c) => c.leg,
      filterFn: eq,
      size: 100,
      cell: ({ row }) => <span className="whitespace-nowrap text-gray-700 dark:text-gray-300">{LEG_LABEL[row.original.leg]}</span>,
    },
    {
      id: 'inspector',
      meta: { label: 'Inspector' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Inspector" />,
      accessorFn: (c) => (c.checkerName ? titleCase(c.checkerName) : c.checkerEmail ?? '—'),
      cell: ({ getValue }) => <span className="text-gray-700 dark:text-gray-300">{getValue() as string}</span>,
    },
    {
      id: 'status',
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorFn: (c) => c.status,
      filterFn: eq,
      size: 120,
      cell: ({ row }) => (
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[row.original.status]}`}>
          {row.original.status === 'submitted' ? 'Submitted' : 'Draft'}
        </span>
      ),
    },
    { id: 'scanned', meta: { label: 'Scanned' }, header: numHeader('Scanned'), accessorFn: (c) => c.scanned.checked, size: 100, cell: ({ row }) => numCell(row.original.scanned.checked) },
    { id: 'unpaid', meta: { label: 'Unpaid' }, header: numHeader('Unpaid'), accessorFn: (c) => c.scanned.unpaid, size: 100, cell: ({ row }) => numCell(row.original.scanned.unpaid) },
    { id: 'no_booking', meta: { label: 'No booking' }, header: numHeader('No booking'), accessorFn: (c) => c.scanned.noBooking, size: 110, cell: ({ row }) => numCell(row.original.scanned.noBooking) },
    { id: 'not_on_route', meta: { label: 'Not on route' }, header: numHeader('Not on route'), accessorFn: (c) => c.scanned.notOnRoute, size: 120, cell: ({ row }) => numCell(row.original.scanned.notOnRoute) },
    { id: 'unknown_cards', meta: { label: 'Unknown cards' }, header: numHeader('Unknown cards'), accessorFn: (c) => c.scanned.unknownCards, size: 130, cell: ({ row }) => numCell(row.original.scanned.unknownCards) },
    {
      id: 'fines_raised',
      meta: { label: 'Fines raised' },
      header: numHeader('Fines raised'),
      // Drafts sort below a submitted check with no fines.
      accessorFn: (c) => (c.status === 'draft' ? -1 : c.scanned.finesRaised),
      enableGlobalFilter: false,
      size: 120,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="whitespace-nowrap text-right">
            {c.status === 'draft' ? (
              // Fines are decided only at submit.
              <span className="text-gray-400 dark:text-gray-500">—</span>
            ) : c.scanned.finesRaised > 0 ? (
              <span className="font-semibold text-red-700 dark:text-red-300">{c.scanned.finesRaised}</span>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">0</span>
            )}
          </div>
        );
      },
    },
  ];
}

// ── Inspectors tab ────────────────────────────────────────────────────────────
// Unassign is the only action, so it stays a plain button; the tab owns the
// confirmation dialog.
export function getInspectorColumns(onUnassign: (r: InspectorRow) => void, busy: boolean): ColumnDef<InspectorRow>[] {
  return [
    {
      id: 'inspector',
      meta: { label: 'Inspector' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Inspector" />,
      accessorFn: (r) => `${inspectorName(r)} ${r.designation ?? ''}`.trim(),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900 dark:text-gray-100">{inspectorName(row.original)}</p>
          {row.original.designation && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{row.original.designation}</p>}
        </div>
      ),
    },
    {
      id: 'login',
      meta: { label: 'Login' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Login" />,
      accessorFn: (r) => (r.unverifiedLogin ? '' : r.loginEmail ?? ''),
      filterFn: (row, _id, value) => (value === 'none' ? row.original.unverifiedLogin : !row.original.unverifiedLogin),
      cell: ({ row }) =>
        row.original.unverifiedLogin ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            No login yet
          </span>
        ) : (
          <span className="truncate text-gray-700 dark:text-gray-300">{row.original.loginEmail}</span>
        ),
    },
    {
      id: 'route',
      meta: { label: 'Route' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (r) => routeLabel(r.routeNumber, r.routeName),
      filterFn: (row, _id, value) => (row.original.routeNumber ?? '') === value,
      cell: ({ getValue }) => <span className="text-gray-700 dark:text-gray-300">{getValue() as string}</span>,
    },
    {
      accessorKey: 'assignedAt',
      meta: { label: 'Assigned' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Assigned" />,
      size: 120,
      cell: ({ row }) => <span className="whitespace-nowrap text-gray-500 dark:text-gray-400">{fmtDate(row.original.assignedAt)}</span>,
    },
    {
      id: 'notes',
      meta: { label: 'Notes' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Notes" />,
      accessorFn: (r) => r.notes ?? '',
      cell: ({ row }) => <p className="max-w-[220px] truncate text-gray-500 dark:text-gray-400">{row.original.notes ?? '—'}</p>,
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      size: 100,
      header: () => <span className="sr-only">Action</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <button
            onClick={() => onUnassign(row.original)}
            disabled={busy}
            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
          >
            Unassign
          </button>
        </div>
      ),
    },
  ];
}

// ── Start inspection tab ──────────────────────────────────────────────────────
const LEGS: CheckLeg[] = ['onward', 'return'];

export function getStartColumns(
  onOpen: (route: MyCheckRoute, leg: CheckLeg) => void,
  busyKey: string | null
): ColumnDef<MyCheckRoute>[] {
  return [
    {
      id: 'route',
      meta: { label: 'Route' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
      accessorFn: (r) => routeLabel(r.routeNumber, r.routeName),
      cell: ({ row }) => (
        <span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{row.original.routeNumber ?? '—'}</span>
          {row.original.routeName && <span className="text-gray-600 dark:text-gray-300"> · {row.original.routeName}</span>}
        </span>
      ),
    },
    {
      id: 'bus',
      meta: { label: 'Bus' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      accessorFn: (r) => r.vehicleReg ?? '',
      cell: ({ row }) =>
        row.original.vehicleReg ? (
          <span className="whitespace-nowrap text-gray-700 dark:text-gray-300">{row.original.vehicleReg}</span>
        ) : (
          <span className="whitespace-nowrap text-gray-400 dark:text-gray-500">Not linked</span>
        ),
    },
    ...LEGS.map<ColumnDef<MyCheckRoute>>((leg) => ({
      id: leg,
      meta: { label: LEG_NAME[leg] },
      header: () => <span>{LEG_NAME[leg]}</span>,
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ row }) => {
        const r = row.original;
        const today = r.today[leg];
        const busy = busyKey === `${r.routeId}:${leg}`;
        const cls = !today
          ? 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600'
          : today.status === 'draft'
            ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            : 'border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300';
        const label = !today ? 'Start' : today.status === 'draft' ? 'Continue draft' : 'Submitted ✓ View';
        return (
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => onOpen(r, leg)}
            className={`inline-flex min-w-[9rem] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${cls}`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {label}
          </button>
        );
      },
    })),
  ];
}
