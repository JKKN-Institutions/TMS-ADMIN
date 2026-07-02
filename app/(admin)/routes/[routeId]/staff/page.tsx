'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Briefcase, Download, Phone, Clock } from 'lucide-react';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';

interface StaffMember {
  name: string;
  staff_id: string | null;
  designation: string | null;
  mobile: string | null;
  email: string | null;
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
  staff: StaffMember[];
}

// Stops grouped in boarding order (the roster arrives already sorted by sequence).
interface StopGroup {
  key: string;
  stop_name: string;
  pickup: string | null;
  evening: string | null;
  staff: StaffMember[];
}

function groupByStop(staff: StaffMember[]): StopGroup[] {
  const groups: StopGroup[] = [];
  for (const s of staff) {
    const key = s.stop_id ?? 'none';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.staff.push(s);
    else
      groups.push({
        key,
        stop_name: s.stop_name ?? 'No stop assigned',
        pickup: s.pickup,
        evening: s.evening,
        staff: [s],
      });
  }
  return groups;
}

function downloadCsv(data: RosterData) {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['S.No', 'Stop', 'Pickup', 'Evening Drop', 'Staff Name', 'Staff ID', 'Designation', 'Mobile', 'Email'];
  const lines = [head.map(cell).join(',')];
  data.staff.forEach((s, i) =>
    lines.push(
      [i + 1, s.stop_name ?? 'No stop assigned', s.pickup ?? '', s.evening ?? '', s.name, s.staff_id ?? '', s.designation ?? '', s.mobile ?? '', s.email ?? '']
        .map(cell)
        .join(',')
    )
  );
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `route-${data.route.route_number}-staff.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const crumbs = (routeId: string, routeNo: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Routes', href: '/routes' },
  { label: `Route ${routeNo}`, href: `/routes/${routeId}` },
  { label: 'Staff' },
];

export default function RouteStaffPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  const [data, setData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/admin/routes/${routeId}/staff`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load staff');
        return json.data as RosterData;
      })
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load staff'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [routeId]);

  const groups = useMemo(() => (data ? groupByStop(data.staff) : []), [data]);

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
        <DetailPageHeader crumbs={crumbs(routeId, '—')} backHref={`/routes/${routeId}`} title="Staff" />
        <p className="text-gray-600">
          {error ?? 'Could not load staff.'}{' '}
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
        title={`Route ${data.route.route_number} — Staff`}
        subtitle={`${data.route.route_name} · ${data.total} staff · ${groups.length} stop${groups.length === 1 ? '' : 's'}`}
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
        <SectionCard title="Staff">
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Briefcase className="h-4 w-4 text-gray-400" /> No staff are currently assigned to this route.
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
                  {g.staff.length}
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
            {/* Staff rows: name wraps fully (never truncated); meta sits beneath it */}
            <ul className="divide-y divide-gray-100 px-4 dark:divide-gray-800">
              {g.staff.map((s, i) => (
                <li key={`${g.key}-${i}`} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-words font-medium text-gray-900 dark:text-gray-100">{s.name}</span>
                      {s.designation && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
                          {s.designation}
                        </span>
                      )}
                    </div>
                    {(s.staff_id || s.mobile) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {s.staff_id && <span className="tabular-nums">{s.staff_id}</span>}
                        {s.mobile && (
                          <a href={`tel:${s.mobile}`} className="inline-flex items-center gap-1 hover:text-green-700">
                            <Phone className="h-3.5 w-3.5" /> {s.mobile}
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

      {data.staff.some((s) => !s.stop_id) && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          Staff under &ldquo;No stop assigned&rdquo; have a route but no boarding stop set on their profile.
        </p>
      )}
    </div>
  );
}
