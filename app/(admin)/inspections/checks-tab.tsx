'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { istToday } from '@/lib/booking/window';
import { fetchChecks } from './inspection-api';

const LEG_LABEL: Record<'onward' | 'return', string> = { onward: 'Morning', return: 'Evening' };
const STATUS_BADGE: Record<'draft' | 'submitted', string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  submitted: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return istToday(d);
}

export function ChecksTab() {
  const router = useRouter();
  const [from, setFrom] = useState(() => daysAgo(7));
  const [to, setTo] = useState(() => daysAgo(0));

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['checks', from, to],
    queryFn: () => fetchChecks({ from, to }),
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      </div>

      {isError && <p className="text-sm text-red-600 dark:text-red-400">{(error as Error).message}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Bus</th>
              <th className="px-4 py-3">Trip</th>
              <th className="px-4 py-3">Inspector</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Checked</th>
              <th className="px-4 py-3 text-right">Unpaid</th>
              <th className="px-4 py-3 text-right">Without booking</th>
              <th className="px-4 py-3 text-right">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading &&
              Array.from({ length: 3 }, (_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3" colSpan={9}>
                    <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                  </td>
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400" colSpan={9}>
                  No checks in this range.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/inspections/checks/${c.id}`)}
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
                <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">{c.personCount}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">{c.counts.unpaid ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">{c.counts.withoutBooking ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">{c.issueCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
