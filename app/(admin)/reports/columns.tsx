'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Bus } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { GroupSummaryRow, LearnerReportRow, RouteSummaryRow } from '@/lib/reports/types';
import { rupees } from '@/lib/reports/view';

const DASH = <span className="text-muted-foreground">—</span>;

/** A figure column. Zero is greyed so the eye lands on the numbers that matter. */
function figure<T>(id: string, title: string, value: (r: T) => number, tone = ''): ColumnDef<T> {
  return {
    id,
    accessorFn: (r) => Number(value(r)) || 0,
    enableGlobalFilter: false,
    meta: { label: title },
    header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
    cell: ({ getValue }) => {
      const v = getValue<number>();
      return <span className={`tabular-nums ${v > 0 ? tone : 'text-muted-foreground'}`}>{v.toLocaleString('en-IN')}</span>;
    },
  };
}

/** Booked-and-boarded over booked. A dash when nothing was booked, never a false 0%. */
function attendancePct<T extends { attendance_pct: number | null }>(): ColumnDef<T> {
  return {
    id: 'attendance_pct',
    accessorFn: (r) => (r.attendance_pct === null ? -1 : Number(r.attendance_pct)),
    enableGlobalFilter: false,
    meta: { label: 'Attendance %' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Attendance %" />,
    cell: ({ row }) => {
      const v = row.original.attendance_pct;
      if (v === null) return DASH;
      const n = Number(v);
      const tone = n >= 75 ? 'bg-green-600' : n >= 50 ? 'bg-amber-700' : 'bg-red-600';
      return (
        <span className={`inline-flex min-w-[3.25rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular-nums ${tone}`}>
          {n}%
        </span>
      );
    },
  };
}

function owed<T extends { amount_owed: number | string }>(): ColumnDef<T> {
  return {
    id: 'amount_owed',
    accessorFn: (r) => Number(r.amount_owed) || 0,
    enableGlobalFilter: false,
    meta: { label: 'Amount owed' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount owed" />,
    cell: ({ getValue }) => {
      const v = getValue<number>();
      return v > 0
        ? <span className="font-medium tabular-nums text-red-600 dark:text-red-400">{rupees(v)}</span>
        : DASH;
    },
  };
}

// ── Buses ───────────────────────────────────────────────────────────────────

export function getBusColumns(): ColumnDef<RouteSummaryRow>[] {
  return [
    {
      id: 'route',
      accessorFn: (r) => `${r.route_number ?? ''} ${r.route_name ?? ''}`.trim(),
      sortingFn: (x, y) =>
        (x.original.route_number ?? '').localeCompare(y.original.route_number ?? '', undefined, { numeric: true }),
      enableHiding: false,
      meta: { label: 'Bus' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="inline-flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300">
              <Bus className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block font-semibold text-foreground">{r.route_number ?? '—'}</span>
              <span className="block truncate text-xs text-muted-foreground">{r.route_name ?? ''}</span>
            </span>
          </span>
        );
      },
    },
    figure('learners', 'Learners', (r) => r.learners, 'text-foreground'),
    figure('service_days', 'Service days', (r) => r.service_days, 'text-foreground'),
    figure('booked', 'Bookings', (r) => r.booked, 'text-foreground'),
    figure('boarded', 'Boarded', (r) => r.boarded, 'text-green-700 dark:text-green-400'),
    figure('no_show', 'No show', (r) => r.no_show, 'text-red-600 dark:text-red-400'),
    figure('without_booking', 'Without booking', (r) => r.without_booking, 'text-orange-700 dark:text-orange-300'),
    figure('unmarked', 'Not marked', (r) => r.unmarked, 'text-foreground'),
    attendancePct<RouteSummaryRow>(),
    figure('fees_unpaid', 'Fees unpaid', (r) => r.fees_unpaid, 'text-red-600 dark:text-red-400'),
    owed<RouteSummaryRow>(),
  ];
}

// ── Institutions / departments ──────────────────────────────────────────────

export function getGroupColumns(group: 'institution' | 'department'): ColumnDef<GroupSummaryRow>[] {
  const title = group === 'department' ? 'Department' : 'Institution';
  return [
    {
      id: 'group',
      accessorFn: (r) => `${r.group_name} ${r.parent_name ?? ''}`.trim(),
      enableHiding: false,
      meta: { label: title },
      header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="block min-w-0 text-left">
            <span className="block font-semibold text-foreground">{r.group_name}</span>
            {r.parent_name && <span className="block truncate text-xs text-muted-foreground">{r.parent_name}</span>}
          </span>
        );
      },
    },
    figure('learners', 'Learners', (r) => r.learners, 'text-foreground'),
    figure('booked', 'Bookings', (r) => r.booked, 'text-foreground'),
    figure('boarded', 'Boarded', (r) => r.boarded, 'text-green-700 dark:text-green-400'),
    figure('no_show', 'No show', (r) => r.no_show, 'text-red-600 dark:text-red-400'),
    figure('without_booking', 'Without booking', (r) => r.without_booking, 'text-orange-700 dark:text-orange-300'),
    figure('unmarked', 'Not marked', (r) => r.unmarked, 'text-foreground'),
    attendancePct<GroupSummaryRow>(),
    figure('fees_unpaid', 'Fees unpaid', (r) => r.fees_unpaid, 'text-red-600 dark:text-red-400'),
    owed<GroupSummaryRow>(),
  ];
}

// ── Learners ────────────────────────────────────────────────────────────────

const ATTENDANCE: Record<LearnerReportRow['attendance'], { label: string; tone: string }> = {
  present: { label: 'Boarded', tone: 'bg-green-600 text-white' },
  absent: { label: 'Absent', tone: 'bg-red-600 text-white' },
  unmarked: { label: 'Not marked', tone: 'bg-slate-500 text-white' },
};

const FEE: Record<LearnerReportRow['fee_state'], { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'text-green-700 dark:text-green-400' },
  unpaid: { label: 'Unpaid', tone: 'text-red-600 dark:text-red-400' },
  none: { label: 'No bill yet', tone: 'text-muted-foreground' },
};

const shortDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });

const istTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
};

function text<T>(id: string, title: string, value: (r: T) => string | null): ColumnDef<T> {
  return {
    id,
    accessorFn: (r) => value(r) ?? '',
    meta: { label: title },
    header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
    cell: ({ getValue }) => {
      const v = getValue<string>();
      return v ? <span className="text-foreground">{v}</span> : DASH;
    },
  };
}

export function getLearnerColumns(): ColumnDef<LearnerReportRow>[] {
  return [
    {
      id: 'day',
      accessorFn: (r) => r.day,
      enableHiding: false,
      enableGlobalFilter: false,
      meta: { label: 'Date' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums text-foreground">{shortDay(row.original.day)}</span>,
    },
    {
      id: 'learner',
      accessorFn: (r) => `${r.learner_name} ${r.roll_number ?? ''}`.trim(),
      enableHiding: false,
      meta: { label: 'Learner' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="block min-w-0">
            <span className="block font-semibold text-foreground">{r.learner_name}</span>
            <span className="block text-xs text-muted-foreground">{r.roll_number ?? 'No roll number'}</span>
          </span>
        );
      },
    },
    text('institution', 'Institution', (r) => r.institution_name),
    text('department', 'Department', (r) => r.department_name),
    {
      id: 'bus',
      accessorFn: (r) => `${r.route_number ?? ''} ${r.route_name ?? ''}`.trim(),
      meta: { label: 'Bus' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bus" />,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.route_number) return DASH;
        return (
          <span className="block min-w-0">
            <span className="block font-medium text-foreground">{r.route_number}</span>
            {r.usual_route_number && r.usual_route_number !== r.route_number && (
              <span className="block text-xs text-muted-foreground">usually {r.usual_route_number}</span>
            )}
          </span>
        );
      },
    },
    text('stop', 'Stop', (r) => r.stop_name),
    {
      id: 'booked',
      accessorFn: (r) => (r.booked ? 'Yes' : 'No'),
      enableGlobalFilter: false,
      meta: { label: 'Booked' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Booked" />,
      cell: ({ row }) =>
        row.original.booked
          ? <span className="font-medium text-foreground">Yes</span>
          : <span className="text-muted-foreground">No</span>,
    },
    {
      id: 'attendance',
      accessorFn: (r) => ATTENDANCE[r.attendance].label,
      enableGlobalFilter: false,
      meta: { label: 'Attendance' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Attendance" />,
      cell: ({ row }) => {
        const r = row.original;
        const a = ATTENDANCE[r.attendance];
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${a.tone}`}>{a.label}</span>
            {r.without_booking && (
              <span className="inline-flex rounded-full bg-orange-600 px-2 py-0.5 text-xs font-semibold text-white">No booking</span>
            )}
            {r.wrong_bus && (
              <span
                className="inline-flex rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white"
                title={r.boarded_route_number ? `Boarded bus ${r.boarded_route_number}` : undefined}
              >
                Wrong bus
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'marked',
      accessorFn: (r) => r.marked_by_name ?? '',
      meta: { label: 'Marked by' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Marked by" />,
      cell: ({ row }) => {
        const r = row.original;
        if (r.attendance === 'unmarked') return DASH;
        const who = r.method === 'auto' ? 'Automatic' : r.marked_by_name;
        const at = istTime(r.marked_at);
        if (!who && !at) return DASH;
        return (
          <span className="block min-w-0">
            <span className="block text-foreground">{who ?? '—'}</span>
            {at && <span className="block text-xs tabular-nums text-muted-foreground">{at}</span>}
          </span>
        );
      },
    },
    {
      id: 'fee',
      accessorFn: (r) => FEE[r.fee_state].label,
      enableGlobalFilter: false,
      meta: { label: 'Fee' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fee" />,
      cell: ({ row }) => {
        const r = row.original;
        const f = FEE[r.fee_state];
        const due = Number(r.amount_owed) || 0;
        return (
          <span className={`whitespace-nowrap font-medium ${f.tone}`}>
            {f.label}
            {r.fee_state === 'unpaid' && due > 0 ? ` · ${rupees(due)}` : ''}
          </span>
        );
      },
    },
  ];
}
