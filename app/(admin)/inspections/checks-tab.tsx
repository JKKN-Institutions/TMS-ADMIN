'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { istToday } from '@/lib/booking/window';
import { fetchChecks } from './inspection-api';

const LEG_LABEL: Record<'onward' | 'return', string> = { onward: 'Morning', return: 'Evening' };
const STATUS_BADGE: Record<'draft' | 'submitted', string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  submitted: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};
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

const num = 'whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300';

export function ChecksTab({
  from,
  to,
  onRangeChange,
}: {
  from: string;
  to: string;
  onRangeChange: (r: { from: string; to: string }) => void;
}) {
  const router = useRouter();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['checks', from, to],
    queryFn: () => fetchChecks({ from, to }),
  });

  const rows = data?.rows ?? [];

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

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Bus</th>
              <th className="px-4 py-3">Trip</th>
              <th className="px-4 py-3">Inspector</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Scanned</th>
              <th className="px-4 py-3 text-right">Unpaid</th>
              <th className="px-4 py-3 text-right">No booking</th>
              <th className="px-4 py-3 text-right">Not on route</th>
              <th className="px-4 py-3 text-right">Unknown cards</th>
              <th className="px-4 py-3 text-right">Fines raised</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading &&
              Array.from({ length: 3 }, (_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3" colSpan={11}>
                    <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                  </td>
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400" colSpan={11}>
                  No checks in this range.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/inspections/checks/${c.id}?from=${from}&to=${to}`)}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
              >
                <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">{c.checkDate}</td>
                <td className="min-w-0 px-4 py-3 text-gray-700 dark:text-gray-300">
                  {c.routeNumber ?? '—'}
                  {c.busRegistration ? ` · ${c.busRegistration}` : ''}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">{LEG_LABEL[c.leg]}</td>
                <td className="min-w-0 px-4 py-3 text-gray-700 dark:text-gray-300">{c.checkerName ?? c.checkerEmail ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[c.status]}`}>
                    {c.status === 'submitted' ? 'Submitted' : 'Draft'}
                  </span>
                </td>
                <td className={num}>{c.scanned.checked}</td>
                <td className={num}>{c.scanned.unpaid}</td>
                <td className={num}>{c.scanned.noBooking}</td>
                <td className={num}>{c.scanned.notOnRoute}</td>
                <td className={num}>{c.scanned.unknownCards}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {c.status === 'draft' ? (
                    // Fines are decided only at submit.
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  ) : c.scanned.finesRaised > 0 ? (
                    <span className="font-semibold text-red-700 dark:text-red-300">{c.scanned.finesRaised}</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
