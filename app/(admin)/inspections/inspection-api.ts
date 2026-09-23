// Client fetchers for the Bus Inspection admin pages (Inspectors / Checks / report).
// Wraps the route-check admin APIs. Matches their REAL response shapes — see
// app/api/admin/route-checkers/route.ts, .../people/route.ts, app/api/admin/route-checks/**
// and app/api/admin/fines/[id]/cancel/route.ts.
import type { CheckPersonEntry } from '@/lib/route-check/types';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return (body as { data: T }).data;
}

export interface InspectorRow {
  id: string;
  checkerEmail: string;
  loginEmail: string | null;
  unverifiedLogin: boolean;
  checkerName: string | null;
  designation: string | null;
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  routeStatus: string | null;
  assignedAt: string;
  notes: string | null;
}

export interface PersonHit {
  source: 'staff' | 'profile';
  name: string;
  designation: string | null;
  collegeEmail: string | null;
  email: string | null;
  staffId: string | null;
  profileId: string | null;
  hasLogin: boolean;
  loginEmail: string | null;
}

export interface CheckListRow {
  id: string;
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  vehicleId: string | null;
  busRegistration: string | null;
  checkerId: string;
  checkerName: string | null;
  checkerEmail: string | null;
  checkDate: string;
  leg: 'onward' | 'return';
  status: 'draft' | 'submitted';
  headcount: number | null;
  unknownCount: number | null;
  counts: {
    registered: number | null;
    booked: number | null;
    present: number | null;
    unpaid: number | null;
    withoutBooking: number | null;
    notOnRoute: number | null;
  };
  personCount: number;
  issueCount: number;
  startedAt: string;
  submittedAt: string | null;
}

export interface CheckReport {
  id: string;
  status: 'draft' | 'submitted';
  checkDate: string;
  leg: 'onward' | 'return';
  route: { id: string; routeNumber: string | null; routeName: string | null } | null;
  bus: { id: string; registration: string | null; model: string | null } | null;
  checker: { id: string; name: string | null; email: string | null };
  headcount: number | null;
  unknownCount: number | null;
  notes: string | null;
  counts: {
    registered: number | null;
    booked: number | null;
    present: number | null;
    unpaid: number | null;
    withoutBooking: number | null;
    notOnRoute: number | null;
  };
  startedAt: string;
  submittedAt: string | null;
  people: CheckPersonEntry[];
}

export const fetchInspectors = () => fetch('/api/admin/route-checkers').then((r) => json<InspectorRow[]>(r));

export const searchPeople = (q: string) =>
  fetch(`/api/admin/route-checkers/people?q=${encodeURIComponent(q)}`).then((r) => json<PersonHit[]>(r));

export const assignInspector = (body: {
  email?: string | null;
  staffId?: string | null;
  profileId?: string | null;
  routeIds: string[];
  notes?: string;
}) =>
  fetch('/api/admin/route-checkers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => json<{ created: { id: string; routeId: string; routeNumber: string | null }[]; skipped: { routeId: string; routeNumber: string | null; reason: string }[] }>(r));

export const unassignInspector = (id: string) =>
  fetch(`/api/admin/route-checkers?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<unknown>(r));

export const fetchChecks = (p: { from: string; to: string; routeId?: string }) =>
  fetch(`/api/admin/route-checks?from=${p.from}&to=${p.to}${p.routeId ? `&routeId=${p.routeId}` : ''}`).then((r) =>
    json<CheckListRow[]>(r)
  );

export const fetchCheck = (id: string) => fetch(`/api/admin/route-checks/${id}`).then((r) => json<CheckReport>(r));

export const waiveFine = (fineId: string, reason: string) =>
  fetch(`/api/admin/fines/${fineId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  }).then((r) => json<{ id: string }>(r));
