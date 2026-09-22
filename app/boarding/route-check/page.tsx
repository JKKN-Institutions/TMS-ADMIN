'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, ClipboardList, Loader2 } from 'lucide-react';
import { LEG_NAME } from '@/lib/boarding/attendance-window';
import type { CheckLeg, MyCheckRoute } from '@/lib/route-check/types';
import { fetchMyRoutes, startCheck } from './route-check-api';

const LEGS: CheckLeg[] = ['onward', 'return'];

function legLabel(entry: MyCheckRoute['today'][CheckLeg]) {
  if (!entry) return 'Start';
  if (entry.status === 'submitted') return 'Submitted ✓';
  return 'Continue';
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="mt-4 flex gap-2">
            <div className="h-9 flex-1 rounded-lg bg-gray-100 dark:bg-gray-800" />
            <div className="h-9 flex-1 rounded-lg bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MyRoutesPage() {
  const router = useRouter();
  const { data: routes, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['route-check', 'my-routes'],
    queryFn: fetchMyRoutes,
  });
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function handleTap(route: MyCheckRoute, leg: CheckLeg) {
    const today = route.today[leg];
    if (today?.status === 'submitted') {
      router.push(`/boarding/route-check/${today.id}`);
      return;
    }
    const key = `${route.routeId}:${leg}`;
    setBusyKey(key);
    try {
      const { checkId } = await startCheck(route.routeId, leg);
      router.push(`/boarding/route-check/${checkId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start check');
      setBusyKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">My Routes</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Pick a route and leg to start checking riders.</p>
      </div>

      {isLoading && <LoadingSkeleton />}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
          <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error instanceof Error ? error.message : 'Failed to load your routes'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && (routes?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-gray-900">
          <ClipboardList className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No routes assigned to you for checking. Ask the Transport Head.
          </p>
        </div>
      )}

      {!isLoading && !isError && (routes?.length ?? 0) > 0 && (
        <div className="space-y-3">
          {routes!.map((route) => (
            <div
              key={route.routeId}
              className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                Route {route.routeNumber ?? '—'}
              </p>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                {route.routeName ?? '—'} &middot; Bus {route.vehicleReg ?? '—'}
              </p>
              <div className="mt-3 flex gap-2">
                {LEGS.map((leg) => {
                  const key = `${route.routeId}:${leg}`;
                  const busy = busyKey === key;
                  const submitted = route.today[leg]?.status === 'submitted';
                  return (
                    <button
                      key={leg}
                      type="button"
                      disabled={busy}
                      onClick={() => handleTap(route, leg)}
                      className={
                        submitted
                          ? 'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 disabled:opacity-60 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300'
                          : 'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-green-700 dark:hover:bg-green-600'
                      }
                    >
                      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {LEG_NAME[leg]}: {legLabel(route.today[leg])}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
