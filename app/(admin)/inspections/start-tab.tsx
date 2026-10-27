'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/ui/data-table';
import type { CheckLeg, MyCheckRoute } from '@/lib/route-check/types';
import { fetchMyRoutes, startCheck } from '@/app/boarding/route-check/route-check-api';
import { getStartColumns } from './columns';

/**
 * Start (or continue) an inspection from the admin panel. Same routes, same
 * start API and same query key as the staff app's list, so a submit on either
 * side refreshes both. The check opens at /inspections/run/[checkId].
 */
export function StartTab() {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['route-check', 'my-routes'],
    queryFn: fetchMyRoutes,
  });

  const routes = useMemo(() => data ?? [], [data]);

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

  // Rebuilt when busyKey changes so every button disables while one check starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => getStartColumns((r, leg) => void open(r, leg), busyKey), [busyKey]);

  return (
    <div className="min-w-0 space-y-4">
      <p className="min-w-0 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Pick a route and trip to start your own inspection. It opens here in the admin panel; scan ID cards, then Finish
        to submit. Buttons show only the checks <span className="font-semibold">you</span> started today.
      </p>

      {isError && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-red-600 dark:text-red-400">
          {(error as Error).message}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">
            Retry
          </button>
        </p>
      )}

      <DataTable
        columns={columns}
        data={routes}
        entityName="routes"
        isLoading={isLoading}
        getRowId={(r) => r.routeId}
        searchPlaceholder="Search route or bus…"
        emptyMessage={routes.length === 0 ? 'No active routes.' : 'No route matches your search.'}
      />
    </div>
  );
}
