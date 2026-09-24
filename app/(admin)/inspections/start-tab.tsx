'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Search } from 'lucide-react';
import { LEG_NAME } from '@/lib/boarding/attendance-window';
import type { CheckLeg, MyCheckRoute } from '@/lib/route-check/types';
import { fetchMyRoutes, startCheck } from '@/app/boarding/route-check/route-check-api';

const LEGS: CheckLeg[] = ['onward', 'return'];

const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

/**
 * Start (or continue) an inspection from the admin panel. Same routes, same
 * start API and same query key as the staff app's list, so a submit on either
 * side refreshes both. The check opens at /inspections/run/[checkId].
 */
export function StartTab() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['route-check', 'my-routes'],
    queryFn: fetchMyRoutes,
  });

  const routes = useMemo(() => {
    const term = q.trim().toLowerCase();
    const all = data ?? [];
    if (!term) return all;
    return all.filter((r) =>
      [r.routeNumber, r.routeName, r.vehicleReg].some((v) => (v ?? '').toLowerCase().includes(term))
    );
  }, [data, q]);

  async function open(route: MyCheckRoute, leg: CheckLeg) {
    const today = route.today[leg];
    if (today?.status === 'submitted') {
      router.push(`/inspections/checks/${today.id}?tab=start`);
      return;
    }
    const key = `${route.routeId}:${leg}`;
    setBusyKey(key);
    try {
      const { checkId } = await startCheck(route.routeId, leg);
      router.push(`/inspections/run/${checkId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start the check');
      setBusyKey(null);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="min-w-0 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
          Pick a route and trip to start your own inspection. It opens here in the admin panel; scan ID cards, then Finish
          to submit. Buttons show only the checks <span className="font-semibold">you</span> started today.
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search route or bus…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      </div>

      {isError && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-red-600 dark:text-red-400">
          {(error as Error).message}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">
            Retry
          </button>
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/60">
            <tr>
              <th className={th}>Route</th>
              <th className={th}>Bus</th>
              {LEGS.map((leg) => (
                <th key={leg} className={th}>
                  {LEG_NAME[leg]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading &&
              Array.from({ length: 4 }, (_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3" colSpan={4}>
                    <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                  </td>
                </tr>
              ))}
            {!isLoading && routes.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400" colSpan={4}>
                  {q ? 'No route matches your search.' : 'No active routes.'}
                </td>
              </tr>
            )}
            {routes.map((r) => (
              <tr key={r.routeId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="min-w-0 px-4 py-3">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{r.routeNumber ?? '—'}</span>
                  {r.routeName && <span className="text-gray-600 dark:text-gray-300"> · {r.routeName}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.vehicleReg ? (
                    <span className="text-gray-700 dark:text-gray-300">{r.vehicleReg}</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">Not linked</span>
                  )}
                </td>
                {LEGS.map((leg) => {
                  const today = r.today[leg];
                  const key = `${r.routeId}:${leg}`;
                  const busy = busyKey === key;
                  const cls = !today
                    ? 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600'
                    : today.status === 'draft'
                      ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      : 'border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300';
                  const label = !today ? 'Start' : today.status === 'draft' ? 'Continue draft' : 'Submitted ✓ View';
                  return (
                    <td key={leg} className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => void open(r, leg)}
                        className={`inline-flex min-w-[9rem] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${cls}`}
                      >
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {label}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
