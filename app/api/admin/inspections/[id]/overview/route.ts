import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';
import { istToday } from '@/lib/booking/window';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { countRegistered, inchargeDuty, type InchargeInput, type Leg, type MarkInput } from '@/lib/inspections/overview';
import { ACTIVE_LIFECYCLE_STATUSES } from '@/lib/passengers/types';
import type { InspectionOverview } from '@/lib/inspections/types';

type Svc = ReturnType<typeof createServiceRoleClient>;

// /api/admin/inspections/<id>/overview
const idFrom = (r: NextRequest) => new URL(r.url).pathname.split('/').filter(Boolean)[3] ?? '';
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const CHUNK = 150;
function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

/** A failed read must never render as "nobody" — it aborts the request. */
class ReadError extends Error {
  constructor(public label: string, public detail: unknown) { super(label); }
}
function must<T>(label: string, res: { data: T | null; error: unknown }): T {
  if (res.error) throw new ReadError(label, res.error);
  return res.data as T;
}

interface StaffRow {
  id: string; first_name: string | null; last_name: string | null; phone: string | null;
  email: string | null; institution_email: string | null; profile_id: string | null;
}
const fullName = (s: { first_name: string | null; last_name: string | null }) =>
  `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();

/**
 * The staff row behind an assignment email. Staff have up to three emails and
 * the assignment copy is usually, but not always, lower case — so match
 * case-insensitively on both staff columns with an ESCAPED ilike pattern
 * (a bare `_` is a wildcard and would match the wrong person).
 */
async function staffForEmail(svc: Svc, email: string): Promise<StaffRow | null> {
  const pattern = emailIlikePattern(email);
  for (const column of ['email', 'institution_email'] as const) {
    const rows = must<StaffRow[]>(`overview staff by ${column}`, await svc
      .from('staff')
      .select('id, first_name, last_name, phone, email, institution_email, profile_id')
      .ilike(column, pattern)
      .order('id')
      .limit(1));
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function getOverview(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_VIEW, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const leg: Leg = new URL(request.url).searchParams.get('leg') === 'return' ? 'return' : 'onward';
    const date = istToday();
    const id = idFrom(request);
    if (!UUID.test(id)) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    const svc = createServiceRoleClient();

    const { data: ins, error: insErr } = await svc.from('tms_inspection').select('route_id, vehicle_id').eq('id', id).maybeSingle();
    if (insErr) {
      console.error('inspection overview: load inspection error:', insErr);
      return NextResponse.json({ error: 'Failed to load inspection' }, { status: 500 });
    }
    if (!ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

    const empty: InspectionOverview = {
      leg, date, route: null, stops: [], driverTrip: null, incharges: [], otherMarkers: [], staffRiders: [],
      registered: { learners: 0, staff: 0, byStop: {}, noStop: 0 },
    };
    if (!ins.route_id) return NextResponse.json({ success: true, data: empty });
    const routeId = ins.route_id as string;

    const [routeQ, busQ, stopsQ, tripQ, assignQ, absenceQ, marksQ, ridersQ, registeredQ] = await Promise.all([
      svc.from('tms_route')
        .select('id, route_number, route_name, start_location, end_location, departure_time, arrival_time, total_capacity')
        .eq('id', routeId).maybeSingle(),
      svc.from('tms_vehicle').select('capacity').eq('id', ins.vehicle_id).maybeSingle(),
      svc.from('tms_route_stop')
        .select('id, stop_name, stop_time, evening_time, sequence_order, is_major_stop')
        .eq('route_id', routeId).eq('is_active', true).order('sequence_order'),
      svc.from('tms_trip').select('status, started_at, ended_at')
        .eq('route_id', routeId).eq('travel_date', date).eq('direction', leg)
        .order('started_at', { ascending: false }).limit(1),
      svc.from('tms_staff_route_assignment').select('id, staff_email').eq('route_id', routeId).eq('is_active', true),
      svc.from('tms_incharge_absence').select('staff_email, covering_assignment_id').eq('route_id', routeId).eq('absence_date', date),
      svc.from('tms_attendance').select('scanned_by, scanned_at')
        .eq('route_id', routeId).eq('trip_date', date).eq('direction', leg)
        .not('scanned_by', 'is', null)
        // NULL <> 'auto' is NULL in SQL, so a bare neq would drop method-less rows.
        .or('method.is.null,method.neq.auto'),
      svc.from('staff').select('id, first_name, last_name, designation, transport_stop_id')
        .eq('bus_required', true).eq('transport_route_id', routeId).eq('is_active', true)
        .order('first_name'),
      // Same allocation filter as loadRouteAttendanceRoster, so "Registered"
      // matches the roster's own starting list.
      svc.from('learners_profiles').select('transport_stop_id')
        .eq('transport_route_id', routeId).eq('bus_required', true)
        .in('lifecycle_status', [...ACTIVE_LIFECYCLE_STATUSES])
        .range(0, 4999),
    ]);

    const route = must<{
      id: string; route_number: string | null; route_name: string | null; start_location: string | null; end_location: string | null;
      departure_time: string | null; arrival_time: string | null; total_capacity: number | null;
    } | null>('overview route', routeQ);
    const bus = must<{ capacity: number | null } | null>('overview vehicle', busQ);
    const stopRows = must<{ id: string; stop_name: string; stop_time: string | null; evening_time: string | null; sequence_order: number | null; is_major_stop: boolean | null }[]>('overview stops', stopsQ) ?? [];
    const trip = (must<{ status: string; started_at: string | null; ended_at: string | null }[]>('overview trip', tripQ) ?? [])[0] ?? null;
    const assignments = must<{ id: string; staff_email: string }[]>('overview assignments', assignQ) ?? [];
    const absences = must<{ staff_email: string; covering_assignment_id: string | null }[]>('overview absences', absenceQ) ?? [];
    const markRows = must<{ scanned_by: string; scanned_at: string }[]>('overview marks', marksQ) ?? [];
    const riderRows = must<{ id: string; first_name: string | null; last_name: string | null; designation: string | null; transport_stop_id: string | null }[]>('overview staff riders', ridersQ) ?? [];
    const registeredRows = must<{ transport_stop_id: string | null }[]>('overview registered learners', registeredQ) ?? [];
    const reg = countRegistered(registeredRows.map((r) => r.transport_stop_id));

    // In-charges: resolve each distinct assignment email to its staff row.
    const assignEmails = [...new Set(assignments.map((a) => a.staff_email.trim().toLowerCase()).filter(Boolean))];
    const resolved = new Map<string, StaffRow | null>();
    await Promise.all(assignEmails.map(async (e) => { resolved.set(e, await staffForEmail(svc, e)); }));
    const incharges: InchargeInput[] = assignEmails.map((e) => {
      const s = resolved.get(e) ?? null;
      return {
        staffEmail: e,
        name: (s && fullName(s)) || e,
        phone: s?.phone ?? null,
        profileIds: [s?.profile_id].filter((x): x is string => !!x),
        emails: [e, s?.email, s?.institution_email].filter((x): x is string => !!x),
      };
    });
    const nameByEmail = new Map(incharges.map((i) => [i.staffEmail, i.name]));

    // Marker profiles (email for matching, name for "other markers").
    const markerIds = [...new Set(markRows.map((m) => m.scanned_by))];
    const profiles = new Map<string, { email: string | null; full_name: string | null }>();
    for (const part of chunks(markerIds)) {
      const rows = must<{ id: string; email: string | null; full_name: string | null }[]>('overview marker profiles',
        await svc.from('profiles').select('id, email, full_name').in('id', part)) ?? [];
      for (const p of rows) profiles.set(p.id, { email: p.email, full_name: p.full_name });
    }
    const marks: MarkInput[] = markRows.map((m) => ({
      scannedBy: m.scanned_by, scannedAt: m.scanned_at, markerEmail: profiles.get(m.scanned_by)?.email ?? null,
    }));

    // Covering in-charge names for declared absences.
    const coverIds = [...new Set(absences.map((a) => a.covering_assignment_id).filter((x): x is string => !!x))];
    const coverEmail = new Map<string, string>();
    for (const part of chunks(coverIds)) {
      const rows = must<{ id: string; staff_email: string }[]>('overview cover assignments',
        await svc.from('tms_staff_route_assignment').select('id, staff_email').in('id', part)) ?? [];
      for (const r of rows) coverEmail.set(r.id, r.staff_email);
    }
    const absenceInputs = absences.map((a) => {
      const ce = a.covering_assignment_id ? coverEmail.get(a.covering_assignment_id) ?? null : null;
      return { staffEmail: a.staff_email, coveredBy: ce ? nameByEmail.get(ce.trim().toLowerCase()) ?? ce : null };
    });

    const { duty, otherMarkers } = inchargeDuty(incharges, marks, absenceInputs);

    const stopName = new Map(stopRows.map((s) => [s.id, s.stop_name]));
    const data: InspectionOverview = {
      leg, date,
      route: route ? {
        id: route.id, number: route.route_number, name: route.route_name,
        start: route.start_location, end: route.end_location,
        departure: route.departure_time, arrival: route.arrival_time,
        capacity: bus?.capacity ?? route.total_capacity ?? null,
      } : null,
      stops: stopRows.map((s) => ({
        id: s.id, order: s.sequence_order, name: s.stop_name,
        morning: s.stop_time, evening: s.evening_time, major: !!s.is_major_stop,
      })),
      driverTrip: trip ? { status: trip.status, startedAt: trip.started_at, endedAt: trip.ended_at } : null,
      incharges: duty,
      otherMarkers: otherMarkers.map((o) => {
        const p = profiles.get(o.profileId);
        return { name: p?.full_name || p?.email || 'Staff', marks: o.marks };
      }),
      staffRiders: riderRows.map((r) => ({
        staffId: r.id, name: fullName(r) || '—', designation: r.designation,
        stopName: r.transport_stop_id ? stopName.get(r.transport_stop_id) ?? null : null,
      })),
      registered: { learners: reg.total, staff: riderRows.length, byStop: reg.byStop, noStop: reg.noStop },
    };
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof ReadError) {
      console.error(`inspection ${e.label} error:`, e.detail);
      return NextResponse.json({ error: 'Failed to load the bus overview' }, { status: 500 });
    }
    console.error('inspection overview error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getOverview(request, auth));
