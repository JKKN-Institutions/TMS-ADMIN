'use client';

import { createContext, useContext } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Undo2 } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { DataTableFilter } from '@/components/ui/data-table';
import type {
  PassengerRelocation,
  RouteAnalysis,
  RouteClassification,
} from '@/lib/route-optimization/types';

export interface AppliedRun {
  id: string;
  travel_date: string;
  threshold_percent: number;
  total_moves: number;
  routes_cancelled: number;
  estimated_savings: number;
  status: 'applied' | 'rolled_back';
  mode: 'today_booking' | 'permanent';
  created_at: string;
  rolled_back_at: string | null;
}

export interface RouteOption {
  id: string;
  label: string;
  spare: number;
}

export function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
function fmtTime(d: string): string {
  return new Date(d).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

const routeClassBadge: Record<RouteClassification, { label: string; cls: string }> = {
  empty: { label: 'Empty', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-200' },
  under_utilized: {
    label: 'Under-utilized',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  healthy: {
    label: 'Healthy',
    cls: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  },
};

const routeLabel = (name: string, num: string | null) => `${name}${num ? ` #${num}` : ''}`;

// ── Per-suggestion moves (Learner · Boarding stop · Moves to) ────────────────

/**
 * The chosen target bus per learner, read by the "Moves to" cell through
 * context rather than baked into the columns. Rebuilding the columns on every
 * pick would hand flexRender a new cell component and remount the <select>,
 * dropping keyboard focus mid-choice.
 */
export const MoveTargetsContext = createContext<{
  targets: Record<string, string>;
  onTarget: (learnerId: string, routeId: string) => void;
}>({ targets: {}, onTarget: () => {} });

function MoveTargetSelect({
  r, sourceRouteId, routeOptions,
}: {
  r: PassengerRelocation;
  sourceRouteId: string;
  routeOptions: RouteOption[];
}) {
  const { targets, onTarget } = useContext(MoveTargetsContext);
  return (
    <>
      <select
        value={targets[r.learnerId] ?? ''}
        onChange={(e) => onTarget(r.learnerId, e.target.value)}
        aria-label={`Move ${r.learnerName} to`}
        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900"
      >
        <option value="">— pick a bus —</option>
        {routeOptions
          .filter((o) => o.id !== sourceRouteId)
          .map((o) => (
            <option key={o.id} value={o.id} disabled={o.spare <= 0 && o.id !== (r.feasible ? r.targetRouteId : '')}>
              {o.label} ({o.spare} free){r.feasible && o.id === r.targetRouteId ? ' · suggested' : ''}
            </option>
          ))}
      </select>
      {targets[r.learnerId] && !r.feasible && (
        <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">manual override</span>
      )}
    </>
  );
}

export function getRelocationColumns(
  sourceRouteId: string,
  routeOptions: RouteOption[]
): ColumnDef<PassengerRelocation>[] {
  return [
    {
      id: 'learner',
      accessorFn: (r) => `${r.learnerName} ${r.learnerRoll ?? ''}`,
      meta: { label: 'Learner' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row: { original: r } }) => (
        <span className="text-gray-900">
          {r.learnerName}
          {r.learnerRoll && <span className="ml-1 text-gray-500">({r.learnerRoll})</span>}
        </span>
      ),
    },
    {
      id: 'boardingStop',
      accessorFn: (r) => r.boardingStop ?? '',
      meta: { label: 'Boarding stop' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Boarding stop" />,
      cell: ({ row }) => <span className="text-gray-600">{row.original.boardingStop || '—'}</span>,
    },
    {
      id: 'movesTo',
      enableSorting: false,
      meta: { label: 'Moves to' },
      header: () => <span>Moves to</span>,
      cell: ({ row }) => (
        <MoveTargetSelect r={row.original} sourceRouteId={sourceRouteId} routeOptions={routeOptions} />
      ),
    },
  ];
}

// ── Applied runs ──────────────────────────────────────────────────────────────

const dash = <span className="text-gray-400">—</span>;

export function getAppliedRunColumns(
  onUndo: (run: AppliedRun) => void,
  rollingBack: string | null
): ColumnDef<AppliedRun>[] {
  return [
    {
      id: 'applied',
      accessorFn: (run) => run.created_at,
      meta: { label: 'Applied' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Applied" />,
      cell: ({ row }) => <span className="text-gray-600">{fmtTime(row.original.created_at)}</span>,
    },
    {
      id: 'mode',
      accessorFn: (run) => (run.mode === 'permanent' ? 'Permanent' : 'Today'),
      meta: { label: 'Mode' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mode" />,
      cell: ({ row }) =>
        row.original.mode === 'permanent' ? (
          <Badge label="Permanent" cls="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" />
        ) : (
          <Badge label="Today" cls="bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300" />
        ),
    },
    {
      accessorKey: 'total_moves',
      meta: { label: 'Moves' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Moves" />,
      cell: ({ row }) => <span className="text-gray-900">{row.original.total_moves}</span>,
    },
    {
      // Permanent runs change standing routes, not a day's buses, so they free
      // none and save nothing on the day — shown as a dash, sorted below 0.
      id: 'routes_cancelled',
      accessorFn: (run) => (run.mode === 'permanent' ? -1 : run.routes_cancelled),
      meta: { label: 'Buses freed' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Buses freed" />,
      cell: ({ row: { original: run } }) => (
        <span className="text-gray-900">{run.mode === 'permanent' ? dash : run.routes_cancelled}</span>
      ),
    },
    {
      id: 'estimated_savings',
      accessorFn: (run) => (run.mode === 'permanent' ? -1 : run.estimated_savings),
      meta: { label: 'Est. savings' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Est. savings" />,
      cell: ({ row: { original: run } }) => (
        <span className="text-gray-900">{run.mode === 'permanent' ? dash : inr(run.estimated_savings)}</span>
      ),
    },
    {
      id: 'status',
      accessorFn: (run) => run.status,
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) =>
        row.original.status === 'applied' ? (
          <Badge label="Applied" cls="bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" />
        ) : (
          <Badge label="Rolled back" cls="bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-200" />
        ),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      size: 90,
      header: () => <div className="text-right font-medium">Action</div>,
      // Opens the page's undo confirmation; nothing is rolled back from here.
      cell: ({ row: { original: run } }) =>
        run.status === 'applied' ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onUndo(run)}
              disabled={rollingBack === run.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
            >
              {rollingBack === run.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 className="h-3.5 w-3.5" />
              )}
              Undo
            </button>
          </div>
        ) : null,
    },
  ];
}

// ── Route occupancy ───────────────────────────────────────────────────────────

export const ROUTE_CLASS_FILTER: DataTableFilter = {
  columnId: 'status',
  title: 'Status',
  options: (Object.keys(routeClassBadge) as RouteClassification[]).map((k) => ({
    label: routeClassBadge[k].label,
    value: k,
  })),
};

export const ROUTE_OCCUPANCY_COLUMNS: ColumnDef<RouteAnalysis>[] = [
  {
    id: 'route',
    accessorFn: (r) => routeLabel(r.routeName, r.routeNumber),
    meta: { label: 'Route' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
    cell: ({ row: { original: r } }) => (
      <span className="text-gray-900">
        {r.routeName}
        {r.routeNumber && <span className="ml-1 text-gray-500">#{r.routeNumber}</span>}
      </span>
    ),
  },
  {
    id: 'booked',
    accessorFn: (r) => r.currentPassengers,
    meta: { label: 'Booked / capacity' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Booked / capacity" />,
    cell: ({ row: { original: r } }) => (
      <span className="text-gray-600">
        {r.currentPassengers} / {r.capacity}
      </span>
    ),
  },
  {
    id: 'utilization',
    accessorFn: (r) => r.utilizationPercent,
    meta: { label: 'Utilization' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Utilization" />,
    cell: ({ row: { original: r } }) => (
      <div className="flex items-center gap-2">
        <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${
              r.classification === 'healthy'
                ? 'bg-green-500'
                : r.classification === 'under_utilized'
                  ? 'bg-amber-500'
                  : 'bg-gray-300'
            }`}
            style={{ width: `${Math.min(100, r.utilizationPercent)}%` }}
          />
        </div>
        <span className="text-gray-600">{r.utilizationPercent}%</span>
      </div>
    ),
  },
  {
    id: 'status',
    accessorFn: (r) => r.classification,
    filterFn: (row, id, value) => row.getValue(id) === value,
    meta: { label: 'Status' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const b = routeClassBadge[row.original.classification];
      return <Badge label={b.label} cls={b.cls} />;
    },
  },
];
