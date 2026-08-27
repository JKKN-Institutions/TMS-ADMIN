'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Route as RouteIcon, UserX, PackageOpen, CalendarX } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { getCoverageColumns, type RouteCoverage } from './coverage-columns';

interface CoverageTotals {
  routes: number;
  unowned: number;
  emptyShares: number;
  unmarkedShares: number;
}

interface CoverageResponse {
  date: string;
  routes: RouteCoverage[];
  totals: CoverageTotals;
}

function istTodayString(): string {
  // Mirrors lib/booking/window.ts istToday() for the client's initial date.
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

async function fetchCoverage(date: string): Promise<CoverageResponse> {
  const res = await fetch(`/api/admin/incharge-coverage?date=${date}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load coverage');
  return json.data as CoverageResponse;
}

/**
 * The Coverage tab of the enforcement board. Formerly the standalone
 * /incharge-coverage page — it lives here because "who missed a mark" and "whose
 * mark had no owner in the first place" are the same question asked one step
 * apart, and reading them on separate screens hid that a strike can be the
 * roster's fault rather than the in-charge's.
 *
 * Keeps its own date state: the strikes board is a running tally, but coverage
 * is only ever true "as of" a given day.
 */
export default function CoveragePanel() {
  const [date, setDate] = useState(istTodayString);

  const {
    data,
    isLoading: loading,
    isError,
  } = useQuery({
    queryKey: ['incharge-coverage', date],
    queryFn: () => fetchCoverage(date),
  });

  React.useEffect(() => {
    if (isError) toast.error('Failed to load coverage board');
  }, [isError]);

  const columns = useMemo(() => getCoverageColumns(), []);
  const routes = data?.routes ?? [];
  const totals = data?.totals ?? { routes: 0, unowned: 0, emptyShares: 0, unmarkedShares: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Routes where somebody&apos;s attendance has no owner — no in-charge, an empty share, or a share left
          unmarked on this date.
        </p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input h-[38px] w-[160px] shrink-0"
          aria-label="Coverage date"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UniversalStatCard
          title="Routes"
          value={totals.routes}
          subtitle="Total routes"
          icon={RouteIcon}
          color="blue"
          loading={loading}
          delay={0}
        />
        <UniversalStatCard
          title="Unowned students"
          value={totals.unowned}
          subtitle="No in-charge holds them"
          icon={UserX}
          color="red"
          loading={loading}
          delay={1}
        />
        <UniversalStatCard
          title="Empty shares"
          value={totals.emptyShares}
          subtitle="In-charges with 0 students"
          icon={PackageOpen}
          color="yellow"
          loading={loading}
          delay={2}
        />
        <UniversalStatCard
          title="Unmarked shares"
          value={totals.unmarkedShares}
          subtitle="Not marked for this date"
          icon={CalendarX}
          color="orange"
          loading={loading}
          delay={3}
        />
      </div>

      <div className="min-w-0 overflow-x-auto">
        <DataTable
          columns={columns}
          data={routes}
          entityName="routes"
          isLoading={loading}
          searchPlaceholder="Search route number, name…"
          getRowId={(r) => r.route_id}
          initialColumnVisibility={{ status: false }}
          filters={[
            {
              columnId: 'status',
              title: 'Status',
              options: [
                { label: 'No in-charge', value: 'no_incharge' },
                { label: 'Empty share', value: 'empty_share' },
                { label: 'Unmarked today', value: 'unmarked' },
                { label: 'OK', value: 'ok' },
              ],
            },
          ]}
        />
      </div>
    </div>
  );
}
