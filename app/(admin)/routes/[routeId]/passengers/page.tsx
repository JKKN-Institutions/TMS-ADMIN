'use client';

import { use, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MapPin, Users, Download } from 'lucide-react';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import { DataTable } from '@/components/ui/data-table';
import { getRosterColumns, getRosterFilters, hasNoStop, type RosterRow } from '../roster-columns';

// ── Shapes returned by the two roster APIs (/learners and /staff). ────────────
interface LearnerApiRow {
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
interface StaffApiRow {
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
interface RouteInfo {
  id: string;
  route_number: string;
  route_name: string;
}

function downloadCsv(route: RouteInfo, people: RosterRow[]) {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['S.No', 'Type', 'Stop', 'Pickup', 'Evening Drop', 'Name', 'ID', 'Role / Status', 'Mobile'];
  const lines = [head.map(cell).join(',')];
  people.forEach((p) =>
    lines.push(
      [
        p.order,
        p.kind === 'learner' ? 'Learner' : 'Staff',
        p.stop_name ?? 'No stop assigned',
        p.pickup ?? '',
        p.evening ?? '',
        p.name,
        (p.kind === 'learner' ? p.register_number : p.staff_id) ?? '',
        (p.kind === 'learner' ? p.status : p.designation) ?? '',
        p.mobile ?? '',
      ]
        .map(cell)
        .join(',')
    )
  );
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `route-${route.route_number}-passengers.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const crumbs = (routeId: string, routeNo: string) => [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Routes', href: '/routes' },
  { label: `Route ${routeNo}`, href: `/routes/${routeId}` },
  { label: 'Passengers' },
];

// Full API response shapes for the two rosters — same shape the standalone
// Learners/Staff pages fetch, so their React Query cache entries (same
// queryKey) can be shared when the pages are visited back-to-back.
interface LearnersRosterData {
  route: RouteInfo;
  total: number;
  learners: LearnerApiRow[];
}
interface StaffRosterData {
  route: RouteInfo;
  total: number;
  staff: StaffApiRow[];
}

async function fetchRouteLearners(routeId: string): Promise<LearnersRosterData> {
  const res = await fetch(`/api/admin/routes/${routeId}/learners`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load learners');
  return json.data as LearnersRosterData;
}

async function fetchRouteStaff(routeId: string): Promise<StaffRosterData> {
  const res = await fetch(`/api/admin/routes/${routeId}/staff`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load staff');
  return json.data as StaffRosterData;
}

export default function RoutePassengersPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);

  // Both rosters are independent — fetch them in parallel, each with its own
  // cache entry keyed per route. Same queryKey/shape as the standalone
  // Learners/Staff pages, so navigating between them shares cache.
  const {
    data: learnersRoster,
    isLoading: learnersLoading,
    isError: learnersIsError,
    error: learnersErrorObj,
  } = useQuery({ queryKey: ['route-learners', routeId], queryFn: () => fetchRouteLearners(routeId) });

  const {
    data: staffRoster,
    isLoading: staffLoading,
    isError: staffIsError,
    error: staffErrorObj,
  } = useQuery({ queryKey: ['route-staff', routeId], queryFn: () => fetchRouteStaff(routeId) });

  const loading = learnersLoading || staffLoading;
  const isError = learnersIsError || staffIsError;
  const route = learnersRoster?.route ?? staffRoster?.route ?? null;
  const error = learnersIsError
    ? (learnersErrorObj instanceof Error ? learnersErrorObj.message : 'Failed to load learners')
    : staffIsError
    ? (staffErrorObj instanceof Error ? staffErrorObj.message : 'Failed to load staff')
    : null;

  // One boarding-order list: learners and staff interleaved by stop sequence
  // (unassigned last), then by name — the same order each API sorts its own
  // roster by, so # matches the order the bus picks people up.
  const allPeople: RosterRow[] = useMemo(() => {
    const merged: Omit<RosterRow, 'order'>[] = [
      ...(learnersRoster?.learners ?? []).map((l) => ({ ...l, kind: 'learner' as const })),
      ...(staffRoster?.staff ?? []).map((s) => ({ ...s, kind: 'staff' as const })),
    ];
    merged.sort(
      (a, b) =>
        (a.sequence_order ?? Number.MAX_SAFE_INTEGER) - (b.sequence_order ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name)
    );
    return merged.map((p, i) => ({ ...p, order: i + 1 }));
  }, [learnersRoster, staffRoster]);

  const learnerCount = learnersRoster?.learners.length ?? 0;
  const staffCount = staffRoster?.staff.length ?? 0;
  const total = allPeople.length;
  const columns = useMemo(() => getRosterColumns('both'), []);
  const filters = useMemo(() => getRosterFilters(allPeople, 'both'), [allPeople]);

  if (loading) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs(routeId, '…')} backHref={`/routes/${routeId}`} title="Loading…" />
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="space-y-6">
        <DetailPageHeader crumbs={crumbs(routeId, '—')} backHref={`/routes/${routeId}`} title="Passengers" />
        <p className="text-gray-600">
          {error ?? 'Could not load passengers.'}{' '}
          <Link href={`/routes/${routeId}`} className="text-green-700 hover:underline">Back to route</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs(routeId, route.route_number)}
        backHref={`/routes/${routeId}`}
        title={`Route ${route.route_number} — Passengers`}
        subtitle={`${route.route_name} · ${total} passenger${total === 1 ? '' : 's'} · ${learnerCount} learner${
          learnerCount === 1 ? '' : 's'
        } · ${staffCount} staff`}
        actions={
          total > 0 ? (
            <button
              onClick={() => downloadCsv(route, allPeople)}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Download className="h-4 w-4" /> Download CSV
            </button>
          ) : null
        }
      />

      {total === 0 ? (
        <SectionCard title="Passengers">
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Users className="h-4 w-4 text-gray-400" /> No passengers are currently assigned to this route.
          </p>
        </SectionCard>
      ) : (
        <DataTable
          columns={columns}
          data={allPeople}
          entityName="passengers"
          filters={filters}
          getRowId={(r) => String(r.order)}
          searchPlaceholder="Search name, ID, stop..."
        />
      )}

      {allPeople.some(hasNoStop) && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          Passengers under &ldquo;No stop assigned&rdquo; have a route but no boarding stop set on their profile.
        </p>
      )}
    </div>
  );
}
