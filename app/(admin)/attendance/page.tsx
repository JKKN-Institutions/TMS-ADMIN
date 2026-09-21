'use client';

/**
 * Attendance coverage — which routes were marked, and which were not.
 *
 * The admin portal previously had no attendance module at all: the only
 * admin-side attendance was an aggregate tab under /bookings → Analytics, which
 * could not say that two routes had never been marked once.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock } from 'lucide-react';
import { CoverageGrid } from './coverage-grid';
import {
  DEFAULT_COVERAGE_THRESHOLD,
  type CoverageRouteRow,
  type CoverageSummary,
} from '@/lib/attendance/coverage';

interface CoverageResponse {
  from: string;
  to: string;
  direction: 'onward' | 'return';
  threshold: number;
  dates: string[];
  routes: CoverageRouteRow[];
  summary: CoverageSummary;
}

function todayStr(): string {
  // IST, matching the date attendance is filed under.
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000).toISOString().slice(0, 10);
}

async function fetchCoverage(q: {
  from: string; to: string; direction: string; threshold: number;
}): Promise<CoverageResponse> {
  const params = new URLSearchParams({
    from: q.from, to: q.to, direction: q.direction, threshold: String(q.threshold),
  });
  const res = await fetch(`/api/admin/attendance/coverage?${params}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(result.error || 'Failed to load coverage');
  return result.data as CoverageResponse;
}

export default function AttendanceCoveragePage() {
  const [to, setTo] = useState(todayStr());
  const [from, setFrom] = useState(minusDays(todayStr(), 29));
  const [direction, setDirection] = useState<'onward' | 'return'>('onward');
  const [threshold, setThreshold] = useState(DEFAULT_COVERAGE_THRESHOLD);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['attendance-coverage', from, to, direction, threshold],
    queryFn: () => fetchCoverage({ from, to, direction, threshold }),
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground">Attendance coverage</h1>
        <p className="text-sm text-muted-foreground">
          Every route, every service day. Only marks made by a person count — trips closed by the
          auto-absent job are shown separately.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="input mt-1 block" />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)}
            className="input mt-1 block" />
        </label>
        <label className="text-xs text-muted-foreground">
          Trip
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'onward' | 'return')}
            className="input mt-1 block">
            <option value="onward">Morning</option>
            <option value="return">Evening</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Counts as marked at
          <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
            className="input mt-1 block">
            <option value={0.3}>30% of the bus</option>
            <option value={0.5}>50% of the bus</option>
            <option value={0.6}>60% of the bus</option>
            <option value={0.8}>80% of the bus</option>
          </select>
        </label>
      </div>

      {data && data.summary.neverMarkedRoutes.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
          <p className="min-w-0 text-foreground">
            <strong>
              {data.summary.neverMarkedRoutes.length} route
              {data.summary.neverMarkedRoutes.length === 1 ? '' : 's'} never marked
            </strong>{' '}
            in this range — {data.summary.neverMarkedLearners} learners have no attendance record:{' '}
            {data.summary.neverMarkedRoutes
              .map((r) => `${r.routeNumber ?? '—'} ${r.routeName ?? ''}`.trim())
              .join(', ')}
            . {data.summary.unmarkedRouteDays} route-days unmarked in total.
          </p>
        </div>
      )}

      {data && data.summary.autoOnlyRouteDays > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
          <p className="min-w-0 text-foreground">
            {data.summary.autoOnlyRouteDays} route-days were closed by the auto-absent job with no
            mark from any staff member. Those learners are recorded absent, but nobody was marking
            the bus.
          </p>
        </div>
      )}

      {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading coverage…</p>}

      {/* An error must NOT fall through to an empty grid: a blank grid reads as
          "no route was ever marked", which is a different and false claim. */}
      {isError && (
        <p className="rounded-lg border border-border p-6 text-sm text-foreground">
          Could not load attendance coverage
          {error instanceof Error ? `: ${error.message}` : ''}. Figures are not shown rather than
          shown as zero.
        </p>
      )}

      {data && !isError && (
        <CoverageGrid routes={data.routes} dates={data.dates} direction={data.direction} />
      )}
    </div>
  );
}
