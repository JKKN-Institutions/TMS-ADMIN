'use client';

import { use, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import { LEG_NAME } from '@/lib/boarding/attendance-window';
import { CHECK_OUTCOME_META } from '@/lib/route-check/outcome-meta';
import { filterLearners, groupByStop, type ScreenFilter } from '@/lib/route-check/filter';
import type { CheckPersonEntry } from '@/lib/route-check/types';
import { CountsBar } from '@/components/route-check/counts-bar';
import { LearnerList } from '@/components/route-check/learner-list';
import { LearnerTable } from '@/components/route-check/learner-table';
import { StaffList } from '@/components/route-check/staff-list';
import { StaffTable } from '@/components/route-check/staff-table';
import { RouteCheckScanDialog } from '@/components/route-check/scan-dialog';
import { FinishPanel } from '@/components/route-check/finish-panel';
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

const KIND_LABEL: Record<CheckPersonEntry['kind'], string> = {
  learner: 'Learner',
  staff: 'Staff',
  manual: 'Manual',
  unknown: 'Unknown card',
};

// Phone: one narrow column (inspectors use this on the bus). Tablet/desktop:
// details in cards, riders / staff / the scan log in tables.
const PAGE = 'mx-auto w-full max-w-lg md:max-w-5xl xl:max-w-7xl';
const CARD = 'min-w-0 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900';

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

function Detail({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`truncate text-sm font-semibold ${muted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
    </div>
  );
}

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
  const [finishOpen, setFinishOpen] = useState(false);

  const learnerGroups = useMemo(() => {
    if (!data || filter === 'staff') return [];
    return groupByStop(filterLearners(data.learners, filter));
  }, [data, filter]);

  // How many rows each chip would show, so the chips double as a summary.
  const chipCounts = useMemo(() => {
    const out = {} as Record<PageFilter, number>;
    if (!data) return out;
    for (const c of FILTER_CHIPS) {
      out[c.key] = c.key === 'staff' ? data.staff.length : filterLearners(data.learners, c.key).length;
    }
    return out;
  }, [data]);

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
      <div className={`${PAGE} space-y-4 p-4`}>
        <div className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`${PAGE} p-4`}>
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

  const removeButton = (e: CheckPersonEntry) =>
    !submitted && (
      <button
        type="button"
        onClick={() => handleRemove(e.id)}
        className={
          removingId === e.id
            ? 'shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300'
            : 'shrink-0 rounded-full px-1.5 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200'
        }
        aria-label="Remove this entry"
      >
        {removingId === e.id ? 'Remove?' : '✕'}
      </button>
    );

  return (
    <div className={`${PAGE} space-y-4 p-4 pb-28 lg:p-6 lg:pb-28`}>
      {/* Check details */}
      <section className={`${CARD} p-4`}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h1 className="min-w-0 truncate text-lg font-bold text-gray-900 md:text-xl dark:text-gray-100">
            Route {route.routeNumber ?? '—'} · {route.routeName ?? '—'}
          </h1>
          <span
            className={
              submitted
                ? 'shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300'
                : 'shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            }
          >
            {submitted ? 'Submitted' : 'Draft'}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Detail label="Bus" value={route.vehicleReg ?? 'Not linked'} muted={!route.vehicleReg} />
          <Detail label="Trip" value={LEG_NAME[check.leg]} />
          <Detail label="Date" value={fmtDate(check.checkDate)} />
          <Detail
            label={submitted ? 'Submitted' : 'Started'}
            value={fmtTime(submitted ? check.submittedAt : check.startedAt)}
          />
        </div>
      </section>

      {isError && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <span className="min-w-0">Couldn&apos;t refresh — showing the last loaded list</span>
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">Retry</button>
        </p>
      )}

      <CountsBar counts={counts} />

      {/* Riders / staff */}
      <section className={CARD}>
        <div className="border-b border-gray-200 p-3 dark:border-gray-800">
          <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:overflow-visible md:px-0">
            <div className="flex w-max gap-1.5 md:w-auto md:flex-wrap">
              {FILTER_CHIPS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilter(c.key)}
                  className={
                    filter === c.key
                      ? 'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white'
                      : 'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }
                >
                  {c.label}
                  <span
                    className={
                      filter === c.key
                        ? 'rounded-full bg-white/25 px-1.5 text-[11px] tabular-nums'
                        : 'rounded-full bg-white px-1.5 text-[11px] tabular-nums text-gray-600 dark:bg-gray-900 dark:text-gray-400'
                    }
                  >
                    {chipCounts[c.key] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Phone: compact list */}
        <div className="px-3 py-3 md:hidden">
          {filter === 'staff' ? <StaffList rows={staff} /> : <LearnerList groups={learnerGroups} />}
        </div>
        {/* Tablet / desktop: table */}
        <div className="hidden md:block">
          {filter === 'staff' ? <StaffTable rows={staff} /> : <LearnerTable groups={learnerGroups} />}
        </div>
      </section>

      {/* Scan log */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Checked in this check</h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {entriesNewestFirst.length}
          </span>
        </div>
        {entriesNewestFirst.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nothing checked yet. Tap Scan to check an ID card.</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 px-4 md:hidden dark:divide-gray-800">
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
                    {removeButton(e)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <th className="px-3 py-2.5">Time</th>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">ID</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Result</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {entriesNewestFirst.map((e) => (
                    <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40">
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gray-500 dark:text-gray-400">{fmtTime(e.createdAt)}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100">{e.name ?? 'Unknown'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600 dark:text-gray-300">{e.code ?? e.scannedCode ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{KIND_LABEL[e.kind]}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHECK_OUTCOME_META[e.outcome].chip}`}>
                          {CHECK_OUTCOME_META[e.outcome].label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{removeButton(e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

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
                onClick={() => setFinishOpen(true)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Finish
              </button>
            </div>
          )}
        </div>
      </div>

      {!submitted && (
        <>
          <RouteCheckScanDialog checkId={checkId} routeId={route.id} open={scanOpen} onClose={() => setScanOpen(false)} />
          <FinishPanel checkId={checkId} counts={counts} open={finishOpen} onClose={() => setFinishOpen(false)} />
        </>
      )}
    </div>
  );
}
