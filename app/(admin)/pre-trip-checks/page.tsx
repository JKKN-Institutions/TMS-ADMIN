'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, Lock, MinusCircle, XCircle } from 'lucide-react';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { cn } from '@/lib/utils';
import { PRE_TRIP_ITEMS } from '@/lib/tracking/pre-trip-check';
import { checkBadge, type AdminCheckRow } from '@/lib/tracking/pre-trip-admin';

interface ListData {
  date: string;
  today: string;
  totals: { all: number; flagged: number };
  rows: AdminCheckRow[];
}
type ListResult = { kind: 'ok'; data: ListData } | { kind: 'forbidden' };

async function fetchChecks(date: string, issuesOnly: boolean): Promise<ListResult> {
  const qs = new URLSearchParams({ date });
  if (issuesOnly) qs.set('issues', '1');
  const res = await fetch(`/api/admin/pre-trip-checks?${qs}`, { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 403) return { kind: 'forbidden' };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { kind: 'ok', data: (await res.json()).data as ListData };
}

function istTodayClient(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
}

/** Plain page for anyone without tms.dashboard.view — never a silent redirect. */
function NoAccess() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
        <Lock className="h-6 w-6 text-amber-700 dark:text-amber-300" />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white">You don&apos;t have access to pre-trip checks</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        This page is for the transport head. If you need it, please contact the transport office.
      </p>
    </div>
  );
}

function Badge({ row }: { row: AdminCheckRow }) {
  const b = checkBadge(row);
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-xs font-semibold',
        b.kind === 'skipped' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
        b.kind === 'issue' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
        b.kind === 'ok' && 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200'
      )}
    >
      {b.label}
    </span>
  );
}

function ItemDot({ value, label }: { value: boolean | null; label: string }) {
  const Icon = value === true ? CheckCircle2 : value === false ? XCircle : MinusCircle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs',
        value === true && 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300',
        value === false && 'bg-red-50 font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300',
        value === null && 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

/** Asks the server for a short-lived signed URL, only when the row is opened. */
function OdometerPhoto({ checkId }: { checkId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['pre-trip-photo', checkId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/pre-trip-checks/${checkId}/photo`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const j = (await res.json().catch(() => null)) as { data?: { url: string }; error?: string } | null;
      if (!res.ok || !j?.data?.url) throw new Error(j?.error ?? 'Could not open the photo');
      return j.data.url;
    },
    staleTime: 60_000, // the signed URL lives 120 s; refetch well before it expires
    gcTime: 60_000,
    retry: false,
  });
  if (isLoading) return <p className="text-sm text-gray-500">Loading photo…</p>;
  if (error || !data) {
    return <p className="text-sm text-red-600 dark:text-red-400">{(error as Error)?.message ?? 'Could not open the photo'}</p>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not an optimisable asset
    <img src={data} alt="Odometer photo" className="max-h-96 w-full rounded-lg bg-gray-100 object-contain dark:bg-gray-800" />
  );
}

function CheckRow({ row, open, onToggle }: { row: AdminCheckRow; open: boolean; onToggle: () => void }) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900 dark:text-white">{row.driverName}</p>
            <p className="truncate text-sm text-gray-600 dark:text-gray-400">
              {row.busRegistration ?? 'Bus not found'} · {timeOf(row.createdAt)}
              {row.odometerKm != null && ` · ${row.odometerKm.toLocaleString('en-IN')} km`}
            </p>
          </div>
          <ChevronDown className={cn('mt-1 h-5 w-5 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
        </div>
        <div className="mt-2">
          <Badge row={row} />
        </div>
        {!row.skipped && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PRE_TRIP_ITEMS.map(({ key, label }) => (
              <ItemDot key={key} value={row.items[key]} label={label} />
            ))}
          </div>
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t border-gray-100 p-4 dark:border-gray-800">
          {row.notes && (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Driver&apos;s note:</span> {row.notes}
            </p>
          )}
          {row.hasPhoto ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Camera className="h-4 w-4" /> Odometer photo
              </p>
              <OdometerPhoto checkId={row.id} />
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No photo — the driver skipped the check.</p>
          )}
        </div>
      )}
    </li>
  );
}

export default function PreTripChecksPage() {
  const [date, setDate] = useState(istTodayClient);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-pre-trip-checks', date, issuesOnly],
    queryFn: () => fetchChecks(date, issuesOnly),
    refetchInterval: 60_000,
  });

  if (data?.kind === 'forbidden') return <NoAccess />;
  const list = data?.kind === 'ok' ? data.data : null;

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-4">
      <DetailPageHeader
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Pre-trip Checks' }]}
        title="Pre-trip Checks"
        subtitle="Drivers' daily checks before the first trip: six items, odometer reading and photo, or a skip with a reason."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Date</span>
          <input
            type="date"
            value={date}
            max={istTodayClient()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 sm:w-auto dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={issuesOnly}
            onChange={(e) => setIssuesOnly(e.target.checked)}
            className="h-4 w-4"
          />
          Issues and skips only
        </label>
      </div>

      {list && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {list.totals.all} check{list.totals.all === 1 ? '' : 's'} on {list.date}
          {list.totals.flagged > 0 && ` · ${list.totals.flagged} with an issue or skip`}
        </p>
      )}

      {isLoading && <p className="py-10 text-center text-sm text-gray-500">Loading…</p>}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Couldn&apos;t load the checks. Please refresh or try again shortly.</span>
        </div>
      )}
      {list && list.rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {issuesOnly ? 'No issues or skips on this date.' : 'No pre-trip checks on this date yet.'}
        </p>
      )}
      {list && list.rows.length > 0 && (
        <ul className="space-y-3">
          {list.rows.map((r) => (
            <CheckRow key={r.id} row={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
