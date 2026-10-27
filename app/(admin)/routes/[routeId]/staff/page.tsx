'use client';

import { use, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MapPin, Briefcase, Download } from 'lucide-react';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import { DataTable } from '@/components/ui/data-table';
import { countStops, getRosterColumns, getRosterFilters, hasNoStop, type RosterRow } from '../roster-columns';

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

async function fetchRouteStaff(routeId: string): Promise<RosterData> {
  const res = await fetch(`/api/admin/routes/${routeId}/staff`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load staff');
  return json.data as RosterData;
}

export default function RouteStaffPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);

  // Cached via React Query, keyed per route so switching between routes never
  // shows stale data. Same key/shape as the combined Passengers page's staff
  // query, so the two share cache when visited back-to-back.
  const {
    data,
    isLoading: loading,
    isError,
    error,
  } = useQuery({ queryKey: ['route-staff', routeId], queryFn: () => fetchRouteStaff(routeId) });

  const rows: RosterRow[] = useMemo(
    () => (data?.staff ?? []).map((s, i) => ({ ...s, order: i + 1, kind: 'staff' as const })),
    [data]
  );
  const columns = useMemo(() => getRosterColumns('staff'), []);
  const filters = useMemo(() => getRosterFilters(rows, 'staff'), [rows]);
  const stopCount = useMemo(() => countStops(rows), [rows]);

  if (loading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs(routeId, '…')} backHref={`/routes/${routeId}`} title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs(routeId, '—')} backHref={`/routes/${routeId}`} title="Staff" />
        <p className="text-gray-600">
          {(error instanceof Error ? error.message : null) ?? 'Could not load staff.'}{' '}
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
        subtitle={`${data.route.route_name} · ${data.total} staff · ${stopCount} stop${stopCount === 1 ? '' : 's'}`}
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
        <DataTable
          columns={columns}
          data={rows}
          entityName="staff"
          filters={filters}
          getRowId={(r) => String(r.order)}
          initialColumnVisibility={{ email: false }}
          searchPlaceholder="Search name, staff ID, stop..."
        />
      )}

      {rows.some(hasNoStop) && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          Staff under &ldquo;No stop assigned&rdquo; have a route but no boarding stop set on their profile.
        </p>
      )}
    </div>
  );
}
