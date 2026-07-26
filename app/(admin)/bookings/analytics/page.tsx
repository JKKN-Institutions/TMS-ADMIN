'use client';

/**
 * Bookings & Attendance analytics. One filter bar scopes BOTH tabs, and its state
 * round-trips through the query string so a filtered view is shareable.
 */

import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, CalendarCheck, Loader2, RefreshCw, ScanLine,
} from 'lucide-react';
import Link from 'next/link';
import { VIZ_CSS, num } from '../../_viz/kit';
import { TabNav } from './controls';
import { FilterBar, parseFilters, serializeFilters } from './filter-bar';
import BookingsTab from './bookings-tab';
import AttendanceTab from './attendance-tab';
import type { AnalyticsPayload } from '@/lib/booking/analytics';

const TABS = [
  { id: 'bookings', label: 'Bookings', Icon: CalendarCheck },
  { id: 'attendance', label: 'Attendance', Icon: ScanLine },
];

async function fetchAnalytics(qs: string): Promise<AnalyticsPayload> {
  const res = await fetch(`/api/admin/bookings/analytics?${qs}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load analytics');
  return json.data as AnalyticsPayload;
}

function AnalyticsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<string>('bookings');

  const { filters, from, to } = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const qs = useMemo(() => serializeFilters(filters, from, to), [filters, from, to]);

  // Push state through the URL so back/forward and sharing both work.
  const push = useCallback(
    (nextQs: string) => router.replace(`/bookings/analytics?${nextQs}`, { scroll: false }),
    [router]
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['bookings-analytics', qs],
    queryFn: () => fetchAnalytics(qs),
    staleTime: 30_000,
  });

  const resultLabel = data
    ? `${num(data.bookings.kpis.total)} bookings · ${num(data.attendance.kpis.records)} attendance records · ${data.range.from} → ${data.range.to}`
    : isError
      ? 'Failed to load'
      : 'Loading…';

  return (
    <div className="viz-scope space-y-6">
      <style dangerouslySetInnerHTML={{ __html: VIZ_CSS }} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/bookings"
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Bookings
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Bookings &amp; Attendance Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live figures from the daily booking and boarding-attendance tables.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex cursor-pointer items-center gap-2 self-start rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <FilterBar
        facets={data?.facets ?? { routes: [], stops: [], institutions: [], departments: [], programs: [] }}
        filters={filters}
        onFiltersChange={(next) => push(serializeFilters(next, from, to))}
        from={from}
        to={to}
        onRangeChange={(f, t) => push(serializeFilters(filters, f, t))}
        showAttendanceFilters={tab === 'attendance'}
        resultLabel={resultLabel}
      />

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {isError ? (
        // A calendar-invalid date, an inverted range, or a >366-day span all come
        // back as a 400 with a specific `error` string — show THAT, not a generic
        // failure, and never fall through to an indefinite spinner (data stays
        // undefined once a query settles into an error state).
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-[var(--viz-serious)]" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Couldn&apos;t load analytics</p>
          <p className="max-w-md text-sm text-muted-foreground" role="alert">
            {error instanceof Error ? error.message : 'Failed to load analytics'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
          </button>
        </div>
      ) : isLoading || !data ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 motion-safe:animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Loading analytics…</p>
          </div>
        </div>
      ) : (
        // Hold the previous render at reduced opacity during a refetch rather than
        // flashing a skeleton — the frame stays stable while filters change.
        <div className={isFetching ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'}>
          <div role="tabpanel" id="panel-bookings" aria-labelledby="tab-bookings" hidden={tab !== 'bookings'}>
            {tab === 'bookings' && <BookingsTab data={data.bookings} />}
          </div>
          <div role="tabpanel" id="panel-attendance" aria-labelledby="tab-attendance" hidden={tab !== 'attendance'}>
            {tab === 'attendance' && <AttendanceTab data={data.attendance} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** useSearchParams requires a Suspense boundary in the App Router. */
export default function BookingsAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 motion-safe:animate-spin text-primary" aria-hidden="true" />
        </div>
      }
    >
      <AnalyticsInner />
    </Suspense>
  );
}
