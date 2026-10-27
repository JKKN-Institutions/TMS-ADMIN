'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/ui/data-table';
import { istToday } from '@/lib/booking/window';
import { fetchChecks } from './inspection-api';
import { getCheckColumns } from './columns';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return istToday(d);
}

/** The Checks date range from the URL, defaulting to the last 7 days. */
export function checksRange(sp: { get: (k: string) => string | null }): { from: string; to: string } {
  const from = sp.get('from');
  const to = sp.get('to');
  return {
    from: from && DATE_RE.test(from) ? from : daysAgo(7),
    to: to && DATE_RE.test(to) ? to : daysAgo(0),
  };
}

export function ChecksTab({
  from,
  to,
  onRangeChange,
}: {
  from: string;
  to: string;
  onRangeChange: (r: { from: string; to: string }) => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['checks', from, to],
    queryFn: () => fetchChecks({ from, to }),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = useMemo(() => getCheckColumns(from, to), [from, to]);
  // Route filter options from the checks actually in range, in route order.
  const routeOptions = useMemo(() => {
    const nums = new Set<string>();
    for (const c of rows) if (c.routeNumber) nums.add(c.routeNumber);
    return [...nums]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((n) => ({ label: n, value: n }));
  }, [rows]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => e.target.value && onRangeChange({ from: e.target.value, to })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => e.target.value && onRangeChange({ from, to: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Counts are for the people the inspector scanned on the bus. Whole-route figures are on each check&apos;s report.
      </p>

      {isError && <p className="text-sm text-red-600 dark:text-red-400">{(error as Error).message}</p>}
      {data?.truncated && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Showing the newest {data.limit} checks only. Narrow the dates to see the rest.
        </p>
      )}

      <DataTable
        columns={columns}
        data={rows}
        entityName="checks"
        isLoading={isLoading}
        getRowId={(c) => c.id}
        searchPlaceholder="Search bus, route or inspector..."
        emptyMessage="No checks in this range."
        filters={[
          ...(routeOptions.length ? [{ columnId: 'route', title: 'Route', options: routeOptions }] : []),
          { columnId: 'leg', title: 'Trip', options: [{ label: 'Morning', value: 'onward' }, { label: 'Evening', value: 'return' }] },
          { columnId: 'status', title: 'Status', options: [{ label: 'Submitted', value: 'submitted' }, { label: 'Draft', value: 'draft' }] },
        ]}
      />
    </div>
  );
}
