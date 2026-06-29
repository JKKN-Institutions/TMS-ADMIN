import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookedCount, routeCapacity } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Roster for one route TODAY: learners who booked today UNION walk-ups (learners
 * with an attendance row today), each with their onward/return status. Authority
 * boundary: staff must be assigned to this route; super admins bypass.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface LearnerLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  register_number: string | null;
  institution_id: string | null;
  degree_id: string | null;
  department_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  section_id: string | null;
  academic_year_id: string | null;
  transport_stop_id: string | null;
}
interface AttRow { learner_id: string; direction: string | null; status: string | null; scanned_at: string | null }

/** Batch id→name lookup for a simple reference table (used for the detail panel). */
async function nameMap(
  svc: SupabaseClient, table: string, nameCol: string, ids: (string | null)[]
): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter((v): v is string => !!v)));
  if (uniq.length === 0) return new Map();
  const { data } = await svc.from(table).select(`id, ${nameCol}`).in('id', uniq);
  return new Map(((data ?? []) as unknown as Record<string, string>[]).map((r) => [r.id, r[nameCol]]));
}

/** The single current transport year name (tms_transport_year.is_current) — global, not per-learner. */
async function currentTransportYear(svc: SupabaseClient): Promise<string | null> {
  const { data } = await svc.from('tms_transport_year').select('name').eq('is_current', true).maybeSingle();
  return (data?.name as string) ?? null;
}

async function getRoster(auth: AuthContext, routeId: string, dateParam: string | null) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!routeId) return NextResponse.json({ error: 'Route id is required' }, { status: 400 });

    // Which day's roster? Defaults to today; a valid date lets staff preview
    // advance bookings (future) or review history (past). Marking stays today-only.
    const today = istToday();
    let date = today;
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
      }
      date = dateParam;
    }

    // Authority: staff may only view rosters for routes they're assigned to.
    if (!auth.isSuperAdmin) {
      const assigned = await getAssignedRouteIdsForUser(auth);
      if (!assigned.includes(routeId)) {
        return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });
      }
    }

    const svc = createServiceRoleClient();

    const { data: route } = await svc
      .from('tms_route').select('id, route_number, route_name').eq('id', routeId).maybeSingle();
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    // Roster = learners who BOOKED this date ∪ learners with attendance this date (walk-ups).
    const { data: bookings } = await svc
      .from('tms_booking')
      .select('learner_id')
      .eq('route_id', routeId)
      .eq('travel_date', date);
    const rosterIds = new Set<string>(((bookings ?? []) as { learner_id: string }[]).map((b) => b.learner_id));

    // Today's attendance for this route, keyed by learner + direction.
    const byLearner: Record<string, { onward: string | null; return: string | null; last: string | null }> = {};
    const { data: att, error } = await svc
      .from('tms_attendance')
      .select('learner_id, direction, status, scanned_at')
      .eq('trip_date', date)
      .eq('route_id', routeId);
    if (!error && att) {
      for (const a of att as AttRow[]) {
        rosterIds.add(a.learner_id); // include walk-ups (attended but not booked)
        const e = (byLearner[a.learner_id] ??= { onward: null, return: null, last: null });
        if (a.direction === 'return') e.return = a.status; else e.onward = a.status;
        if (a.scanned_at && (!e.last || a.scanned_at > e.last)) e.last = a.scanned_at;
      }
    }

    const idList = Array.from(rosterIds);
    const { data: studs } = idList.length
      ? await svc
          .from('learners_profiles')
          .select('id, first_name, last_name, roll_number, register_number, institution_id, degree_id, department_id, program_id, semester_id, section_id, academic_year_id, transport_stop_id')
          .in('id', idList)
      : { data: [] as LearnerLite[] };
    const students = (studs ?? []) as LearnerLite[];

    // Resolve reference ids → names for the click-through detail panel. Reuse the
    // Passenger module's loader for the four it covers; add degree/section/academic
    // year here, plus the single current transport year (global).
    const [refs, degrees, sections, academicYears, transportYear] = await Promise.all([
      loadPassengerRefs(svc, {
        institutionIds: students.map((s) => s.institution_id),
        departmentIds: students.map((s) => s.department_id),
        routeIds: [routeId],
        stopIds: students.map((s) => s.transport_stop_id),
        programIds: students.map((s) => s.program_id),
        semesterIds: students.map((s) => s.semester_id),
      }),
      nameMap(svc, 'degrees', 'degree_name', students.map((s) => s.degree_id)),
      nameMap(svc, 'sections', 'section_name', students.map((s) => s.section_id)),
      nameMap(svc, 'academic_years', 'academic_year_name', students.map((s) => s.academic_year_id)),
      currentTransportYear(svc),
    ]);
    const pick = (m: Map<string, string>, id: string | null) => (id ? m.get(id) ?? null : null);

    let presentOnward = 0, presentReturn = 0;
    const rows = students
      .map((s) => {
        const att = byLearner[s.id] ?? { onward: null, return: null, last: null };
        if (att.onward === 'present') presentOnward += 1;
        if (att.return === 'present') presentReturn += 1;
        return {
          id: s.id,
          name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'Learner',
          roll_number: s.roll_number,
          onward_status: att.onward,
          return_status: att.return,
          last_scanned_at: att.last,
          // Detail panel fields (resolved names; null → shown as "—" in the UI)
          register_number: s.register_number,
          institution: pick(refs.institutions, s.institution_id),
          degree: pick(degrees, s.degree_id),
          department: pick(refs.departments, s.department_id),
          program: pick(refs.programs, s.program_id),
          semester: pick(refs.semesters, s.semester_id),
          section: pick(sections, s.section_id),
          academic_year: pick(academicYears, s.academic_year_id),
          transport_year: transportYear,
          stop: pick(refs.stops, s.transport_stop_id),
        };
      })
      .sort((a, b) => (a.roll_number ?? a.name).localeCompare(b.roll_number ?? b.name));

    const [booked, capacity] = await Promise.all([
      bookedCount(svc, routeId, date),
      routeCapacity(svc, routeId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        route: { id: route.id, route_number: route.route_number, route_name: route.route_name },
        date,
        isToday: date === today,
        counts: {
          total: students.length,
          booked,
          capacity,
          present_onward: presentOnward,
          present_return: presentReturn,
        },
        students: rows,
      },
    });
  } catch (e) {
    console.error('boarding roster error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((req: NextRequest, auth) => {
  // Extract [routeId] from the path: /api/boarding/routes/<routeId>/roster
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const routeId = decodeURIComponent(parts[parts.indexOf('routes') + 1] ?? '');
  return getRoster(auth, routeId, url.searchParams.get('date'));
});
