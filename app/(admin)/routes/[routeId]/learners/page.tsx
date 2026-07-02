'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Users, Download, Phone, Clock } from 'lucide-react';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';

interface Learner {
  name: string;
  register_number: string | null;
  roll_number: string | null;
  mobile: string | null;
  status: string | null;
  stop_id: string | null;
  stop_name: string | null;
  sequence_order: number | null;
  pickup: string | null;
  evening: string | null;
}
interface RosterData {
  route: { id: string; route_number: string; route_name: string };
  total: number;
  learners: Learner[];
}

// Stops grouped in boarding order (the roster arrives already sorted by sequence).
interface StopGroup {
  key: string;
  stop_name: string;
  pickup: string | null;
  evening: string | null;
  learners: Learner[];
}

const statusStyle: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  admitted: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  account: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
};
function StatusBadge({ status }: { status: string | null }) {
  const cls = statusStyle[status ?? ''] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status ?? 'unknown'}
    </span>
  );
}

function groupByStop(learners: Learner[]): StopGroup[] {
  const groups: StopGroup[] = [];
  for (const l of learners) {
    const key = l.stop_id ?? 'none';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.learners.push(l);
    else
      groups.push({
        key,
        stop_name: l.stop_name ?? 'No stop assigned',
        pickup: l.pickup,
        evening: l.evening,
        learners: [l],
      });
  }
  return groups;
}

function downloadCsv(data: RosterData) {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['S.No', 'Stop', 'Pickup', 'Evening Drop', 'Learner Name', 'Register No', 'Roll No', 'Mobile', 'Status'];
  const lines = [head.map(cell).join(',')];
  data.learners.forEach((l, i) =>
    lines.push(
      [i + 1, l.stop_name ?? 'No stop assigned', l.pickup ?? '', l.evening ?? '', l.name, l.register_number ?? '', l.roll_number ?? '', l.mobile ?? '', l.status ?? '']
        .map(cell)
        .join(',')
    )
  );
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `route-${data.route.route_number}-learners.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const crumbs = (routeId: string, routeNo: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Routes', href: '/routes' },
  { label: `Route ${routeNo}`, href: `/routes/${routeId}` },
  { label: 'Learners' },
];

export default function RouteLearnersPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  const [data, setData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/admin/routes/${routeId}/learners`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load learners');
        return json.data as RosterData;
      })
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load learners'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [routeId]);

  const groups = useMemo(() => (data ? groupByStop(data.learners) : []), [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs(routeId, '…')} backHref={`/routes/${routeId}`} title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs(routeId, '—')} backHref={`/routes/${routeId}`} title="Learners" />
        <p className="text-gray-600">
          {error ?? 'Could not load learners.'}{' '}
          <Link href={`/routes/${routeId}`} className="text-green-700 hover:underline">Back to route</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(routeId, data.route.route_number)}
        backHref={`/routes/${routeId}`}
        title={`Route ${data.route.route_number} — Learners`}
        subtitle={`${data.route.route_name} · ${data.total} learner${data.total === 1 ? '' : 's'} · ${groups.length} stop${groups.length === 1 ? '' : 's'}`}
        actions={
          data.total > 0 ? (
            <button
              onClick={() => downloadCsv(data)}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Download className="h-4 w-4" /> Download CSV
            </button>
          ) : null
        }
      />

      {data.total === 0 ? (
        <SectionCard title="Learners">
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Users className="h-4 w-4 text-gray-400" /> No learners are currently assigned to this route.
          </p>
        </SectionCard>
      ) : (
        groups.map((g) => (
          <div
            key={g.key}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
          >
            {/* Stop header: stacks on phones, one row from sm up */}
            <div className="flex flex-col gap-1.5 border-b border-gray-100 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                <h2 className="min-w-0 break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {g.stop_name}
                </h2>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-500/15 dark:text-gray-300">
                  {g.learners.length}
                </span>
              </div>
              {(g.pickup || g.evening) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 sm:shrink-0">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-gray-400" /> Morning {g.pickup ?? '—'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-gray-400" /> Evening {g.evening ?? '—'}
                  </span>
                </div>
              )}
            </div>
            {/* Learner rows: name wraps fully (never truncated); meta sits beneath it */}
            <ul className="divide-y divide-gray-100 px-4 dark:divide-gray-800">
              {g.learners.map((l, i) => (
                <li key={`${g.key}-${i}`} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-words font-medium text-gray-900 dark:text-gray-100">{l.name}</span>
                      <StatusBadge status={l.status} />
                    </div>
                    {(l.register_number || l.mobile) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {l.register_number && <span className="tabular-nums">{l.register_number}</span>}
                        {l.mobile && (
                          <a href={`tel:${l.mobile}`} className="inline-flex items-center gap-1 hover:text-green-700">
                            <Phone className="h-3.5 w-3.5" /> {l.mobile}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {data.learners.some((l) => !l.stop_id) && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          Learners under &ldquo;No stop assigned&rdquo; have a route but no boarding stop set on their profile.
        </p>
      )}
    </div>
  );
}
