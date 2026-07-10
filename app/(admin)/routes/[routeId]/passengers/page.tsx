'use client';

import { use, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MapPin, Users, Briefcase, Download, Phone, Clock } from 'lucide-react';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';

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

// ── Normalised person the combined view renders (learner OR staff). ───────────
interface Person {
  kind: 'learner' | 'staff';
  name: string;
  idLabel: string | null; // register number (learner) or staff id (staff)
  meta: string | null; // lifecycle status (learner) or designation (staff)
  mobile: string | null;
  stop_id: string | null;
  stop_name: string | null;
  sequence_order: number | null;
  pickup: string | null;
  evening: string | null;
}

interface StopGroup {
  key: string;
  stop_name: string;
  pickup: string | null;
  evening: string | null;
  people: Person[];
}

const learnerStatusStyle: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  admitted: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  account: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
};

function Badge({ person }: { person: Person }) {
  if (!person.meta) return null;
  const cls =
    person.kind === 'learner'
      ? learnerStatusStyle[person.meta] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300'
      : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {person.meta}
    </span>
  );
}

// Roster arrives pre-sorted by stop sequence, so a linear pass groups it.
function groupByStop(people: Person[]): StopGroup[] {
  const groups: StopGroup[] = [];
  for (const p of people) {
    const key = p.stop_id ?? 'none';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.people.push(p);
    else
      groups.push({
        key,
        stop_name: p.stop_name ?? 'No stop assigned',
        pickup: p.pickup,
        evening: p.evening,
        people: [p],
      });
  }
  return groups;
}

function downloadCsv(route: RouteInfo, people: Person[]) {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['S.No', 'Type', 'Stop', 'Pickup', 'Evening Drop', 'Name', 'ID', 'Role / Status', 'Mobile'];
  const lines = [head.map(cell).join(',')];
  people.forEach((p, i) =>
    lines.push(
      [
        i + 1,
        p.kind === 'learner' ? 'Learner' : 'Staff',
        p.stop_name ?? 'No stop assigned',
        p.pickup ?? '',
        p.evening ?? '',
        p.name,
        p.idLabel ?? '',
        p.meta ?? '',
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

// One stop-grouped section (used for both the Learners and the Staff blocks).
function RosterSection({
  title,
  icon: Icon,
  people,
  emptyLabel,
}: {
  title: string;
  icon: typeof Users;
  people: Person[];
  emptyLabel: string;
}) {
  const groups = useMemo(() => groupByStop(people), [people]);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-500/15 dark:text-gray-300">
          {people.length}
        </span>
      </div>

      {people.length === 0 ? (
        <SectionCard title="">
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Icon className="h-4 w-4 text-gray-400" /> {emptyLabel}
          </p>
        </SectionCard>
      ) : (
        groups.map((g) => (
          <div
            key={g.key}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex flex-col gap-1.5 border-b border-gray-100 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                <h3 className="min-w-0 break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {g.stop_name}
                </h3>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-500/15 dark:text-gray-300">
                  {g.people.length}
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
            <ul className="divide-y divide-gray-100 px-4 dark:divide-gray-800">
              {g.people.map((p, i) => (
                <li key={`${g.key}-${i}`} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-words font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                      <Badge person={p} />
                    </div>
                    {(p.idLabel || p.mobile) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {p.idLabel && <span className="tabular-nums">{p.idLabel}</span>}
                        {p.mobile && (
                          <a href={`tel:${p.mobile}`} className="inline-flex items-center gap-1 hover:text-green-700">
                            <Phone className="h-3.5 w-3.5" /> {p.mobile}
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
    </section>
  );
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

  const learners: Person[] = useMemo(
    () =>
      (learnersRoster?.learners ?? []).map((l) => ({
        kind: 'learner' as const,
        name: l.name,
        idLabel: l.register_number,
        meta: l.status,
        mobile: l.mobile,
        stop_id: l.stop_id,
        stop_name: l.stop_name,
        sequence_order: l.sequence_order,
        pickup: l.pickup,
        evening: l.evening,
      })),
    [learnersRoster]
  );

  const staff: Person[] = useMemo(
    () =>
      (staffRoster?.staff ?? []).map((s) => ({
        kind: 'staff' as const,
        name: s.name,
        idLabel: s.staff_id,
        meta: s.designation,
        mobile: s.mobile,
        stop_id: s.stop_id,
        stop_name: s.stop_name,
        sequence_order: s.sequence_order,
        pickup: s.pickup,
        evening: s.evening,
      })),
    [staffRoster]
  );

  const total = learners.length + staff.length;
  const allPeople = useMemo(() => [...learners, ...staff], [learners, staff]);

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
        subtitle={`${route.route_name} · ${total} passenger${total === 1 ? '' : 's'} · ${learners.length} learner${
          learners.length === 1 ? '' : 's'
        } · ${staff.length} staff`}
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
        <>
          <RosterSection
            title="Learners"
            icon={Users}
            people={learners}
            emptyLabel="No learners are currently assigned to this route."
          />
          <RosterSection
            title="Staff"
            icon={Briefcase}
            people={staff}
            emptyLabel="No staff are currently assigned to this route."
          />
        </>
      )}

      {allPeople.some((p) => !p.stop_id) && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          Passengers under &ldquo;No stop assigned&rdquo; have a route but no boarding stop set on their profile.
        </p>
      )}
    </div>
  );
}
