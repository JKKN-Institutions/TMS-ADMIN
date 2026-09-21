'use client';

/**
 * One route, one date, one leg — the drill-down from a coverage cell.
 *
 * Read-only in this task; Task 9 adds the marking controls for super admins and
 * tms.attendance.override holders.
 */

import React, { use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock } from 'lucide-react';
import type { RosterRow } from '@/lib/booking/roster';

interface AdminRosterResponse {
  date: string;
  direction: 'onward' | 'return';
  route: { id: string; route_number: string | null; route_name: string | null };
  rows: RosterRow[];
  counts: { total: number; present: number; absent: number; unmarked: number; auto: number };
}

async function fetchRoster(routeId: string, date: string, direction: string): Promise<AdminRosterResponse> {
  const params = new URLSearchParams({ routeId, date, direction });
  const res = await fetch(`/api/admin/attendance/roster?${params}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load roster');
  return result.data as AdminRosterResponse;
}

const STATUS_CLASS: Record<RosterRow['status'], string> = {
  present: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  absent: 'bg-red-500/15 text-red-700 dark:text-red-400',
  unmarked: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<RosterRow['status'], string> = {
  present: 'Present',
  absent: 'Absent',
  unmarked: 'Unmarked',
};

export default function AttendanceDayPage({
  params,
}: {
  params: Promise<{ routeId: string; date: string }>;
}) {
  const { routeId, date } = use(params);
  const search = useSearchParams();
  const direction = search.get('direction') === 'return' ? 'return' : 'onward';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-attendance-roster', routeId, date, direction],
    queryFn: () => fetchRoster(routeId, date, direction),
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Link href="/attendance" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Attendance coverage
      </Link>

      <header className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-foreground">
          {data ? `${data.route.route_number ?? '—'} ${data.route.route_name ?? ''}` : 'Route'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {date} · {direction === 'return' ? 'Evening' : 'Morning'} trip
        </p>
      </header>

      {data && data.counts.auto > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
          <p className="min-w-0 text-foreground">
            {data.counts.auto} of these were recorded by the auto-absent job, not by a person.
          </p>
        </div>
      )}

      {data && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span>Total <strong className="tabular-nums">{data.counts.total}</strong></span>
          <span>Present <strong className="tabular-nums">{data.counts.present}</strong></span>
          <span>Absent <strong className="tabular-nums">{data.counts.absent}</strong></span>
          <span>Unmarked <strong className="tabular-nums">{data.counts.unmarked}</strong></span>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading roster…</p>}

      {isError && (
        <p className="rounded-lg border border-border p-6 text-sm text-foreground">
          Could not load this roster{error instanceof Error ? `: ${error.message}` : ''}. Nothing is
          shown rather than shown as empty.
        </p>
      )}

      {data && !isError && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Learner</th>
                <th className="px-3 py-2">Roll</th>
                <th className="px-3 py-2">Stop</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Marked by</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.learner_id} className="border-t border-border">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.roll ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.stop_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.is_walk_up ? 'Rode without ticket' : r.booked ? 'Booked' : 'No ticket'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.method === 'auto' ? 'Auto-absent job' : r.marked_by_name ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
