'use client';

import { use, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import { LEG_NAME } from '@/lib/boarding/attendance-window';
import { CHECK_OUTCOME_META } from '@/lib/route-check/outcome-meta';
import { filterLearners, groupByStop, type ScreenFilter } from '@/lib/route-check/filter';
import { CountsBar } from '@/components/route-check/counts-bar';
import { LearnerList } from '@/components/route-check/learner-list';
import { StaffList } from '@/components/route-check/staff-list';
import { RouteCheckScanDialog } from '@/components/route-check/scan-dialog';
import { fetchCheck, removeEntry } from '../route-check-api';

type PageFilter = ScreenFilter | 'staff';
const FILTER_CHIPS: { key: PageFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unchecked', label: 'Unchecked' },
  { key: 'checked', label: 'Checked' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'without_booking', label: 'No booking' },
  { key: 'not_on_route', label: 'Not on bus' },
  { key: 'staff', label: 'Staff' },
];

export default function RouteCheckPage({ params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = use(params);
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['route-check', checkId],
    queryFn: () => fetchCheck(checkId),
    refetchOnWindowFocus: true,
  });
  const [filter, setFilter] = useState<PageFilter>('all');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const learnerGroups = useMemo(() => {
    if (!data || filter === 'staff') return [];
    return groupByStop(filterLearners(data.learners, filter));
  }, [data, filter]);

  const entriesNewestFirst = useMemo(() => {
    if (!data) return [];
    return [...data.entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }, [data]);

  async function handleRemove(personId: string) {
    if (removingId !== personId) {
      setRemovingId(personId);
      setTimeout(() => setRemovingId((cur) => (cur === personId ? null : cur)), 3000);
      return;
    }
    setRemovingId(null);
    try {
      await removeEntry(checkId, personId);
      await qc.invalidateQueries({ queryKey: ['route-check', checkId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove');
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
          <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error instanceof Error ? error.message : 'Failed to load this check'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { check, route, staff, counts } = data;
  const submitted = check.status === 'submitted';

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-28">
      <div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h1 className="min-w-0 truncate text-lg font-bold text-gray-900 dark:text-gray-100">
            Route {route.routeNumber ?? '—'} · {route.routeName ?? '—'}
          </h1>
          <span
            className={
              submitted
                ? 'shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300'
                : 'shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            }
          >
            {submitted ? 'Submitted' : 'Draft'}
          </span>
        </div>
        <p className="truncate text-sm text-gray-500 dark:text-gray-400">
          Bus {route.vehicleReg ?? '—'} · {LEG_NAME[check.leg]} · {check.checkDate}
        </p>
      </div>

      {isError && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <span className="min-w-0">Couldn&apos;t refresh — showing the last loaded list</span>
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">Retry</button>
        </p>
      )}

      <CountsBar counts={counts} />

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5">
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={
                filter === c.key
                  ? 'shrink-0 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'shrink-0 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {filter === 'staff' ? <StaffList rows={staff} /> : <LearnerList groups={learnerGroups} />}

      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Checked in this check ({entriesNewestFirst.length})</h2>
        {entriesNewestFirst.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">Nothing checked yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
            {entriesNewestFirst.map((e) => (
              <li key={e.id} className="flex min-w-0 items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate text-sm">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{e.name ?? 'Unknown'}</span>
                  {e.code && <span className="text-gray-500 dark:text-gray-400"> · {e.code}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHECK_OUTCOME_META[e.outcome].chip}`}>
                    {CHECK_OUTCOME_META[e.outcome].label}
                  </span>
                  {!submitted && (
                    <button
                      type="button"
                      onClick={() => handleRemove(e.id)}
                      className={
                        removingId === e.id
                          ? 'shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : 'shrink-0 rounded-full px-1.5 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                      }
                    >
                      {removingId === e.id ? 'Remove?' : '✕'}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur lg:bottom-4 dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto max-w-lg">
          {submitted ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-center text-sm font-medium text-green-800 dark:bg-green-900/20 dark:text-green-300">
              Submitted at {check.submittedAt ? new Date(check.submittedAt).toLocaleString('en-IN') : '—'}
            </p>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
              >
                Scan
              </button>
              <button
                type="button"
                onClick={() => { /* wired in Task 13 */ }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Finish
              </button>
            </div>
          )}
        </div>
      </div>

      {!submitted && (
        <RouteCheckScanDialog checkId={checkId} routeId={route.id} open={scanOpen} onClose={() => setScanOpen(false)} />
      )}
    </div>
  );
}
