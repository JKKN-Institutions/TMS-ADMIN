// app/api/admin/bookings/analytics/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday, addDays } from '@/lib/booking/window';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import {
  aggregateAttendance, aggregateBookings, buildFacets, filterAttendance, filterBookings,
  type AnalyticsFilters, type AnalyticsPayload, type AttendanceRow, type BookingRow,
  type Labels, type LearnerDim,
} from '@/lib/booking/analytics';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bookings & Attendance analytics, aggregated server-side over the live
 * tms_booking / tms_attendance tables.
 *
 * The DATE RANGE is the only server-side filter. Route, stop, academic,
 * booked-by, direction, status and method all run in memory — tms_booking has no
 * academic columns, and pushing an academic filter into SQL would require
 * `.in()`-ing hundreds of learner UUIDs, which the gateway rejects with HTTP 400
 * above ~500 ids. Facets are also built from the unfiltered range set so that
 * selecting one department does not erase the others from the dropdown.
 */

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';
const IN_CHUNK = 150;
const MAX_SPAN_DAYS = 366;

/**
 * Shape AND calendar validity. A shape-only regex accepts '2026-13-45', which
 * reaches Postgres as a malformed date and comes back as error 22008 — surfacing
 * to the client as a confusing 500 instead of "you sent a bad date". Round-tripping
 * through Date.UTC catches the rollover, since an invalid day silently becomes a
 * different valid one.
 */
function isDate(v: string | null): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const daysApart = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );

const list = (v: string | null): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

const oneOf = <T extends string>(v: string | null, allowed: readonly T[]): T | null =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : null;

interface LearnerRow {
  id: string;
  profile_id: string | null;
  institution_id: string | null;
  department_id: string | null;
  program_id: string | null;
}

/** Chunked .in() fetch (≤150 ids/call) — larger lists overflow the API gateway. */
async function fetchByIds<T>(
  svc: SupabaseClient,
  table: string,
  columns: string,
  ids: string[]
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await svc
      .from(table)
      .select(columns)
      .in('id', ids.slice(i, i + IN_CHUNK));
    if (error) throw error; // never let a gateway 400 masquerade as an empty result
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function getAnalytics(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const today = istToday();
    const rawTo = params.get('to');
    const rawFrom = params.get('from');

    // Bad input is the client's error, not ours — 400 with a reason beats a 500
    // from Postgres or a silently misleading all-zero 200.
    if ((rawTo && !isDate(rawTo)) || (rawFrom && !isDate(rawFrom))) {
      return NextResponse.json(
        { error: 'from and to must be valid calendar dates in YYYY-MM-DD form' },
        { status: 400 }
      );
    }
    const to = isDate(rawTo) ? rawTo : today;
    const from = isDate(rawFrom) ? rawFrom : addDays(to, -29);

    const span = daysApart(from, to);
    if (span < 0) {
      return NextResponse.json({ error: 'from must not be after to' }, { status: 400 });
    }
    // Everything but the date range is filtered in memory, so an unbounded span
    // pulls the whole table into the lambda. Cap it rather than let it grow.
    if (span > MAX_SPAN_DAYS) {
      return NextResponse.json(
        { error: `Date range must not exceed ${MAX_SPAN_DAYS} days` },
        { status: 400 }
      );
    }

    const filters: AnalyticsFilters = {
      routeIds: list(params.get('route_id')),
      stopIds: list(params.get('stop_id')),
      institutionIds: list(params.get('institution_id')),
      departmentIds: list(params.get('department_id')),
      programIds: list(params.get('program_id')),
      bookedBy: oneOf(params.get('booked_by'), ['self', 'admin'] as const),
      direction: oneOf(params.get('direction'), ['onward', 'return'] as const),
      attStatus: oneOf(params.get('att_status'), ['present', 'absent'] as const),
      method: oneOf(params.get('method'), ['qr_scan', 'manual'] as const),
    };

    const svc = createServiceRoleClient();

    const [bookingRes, attRes] = await Promise.all([
      svc
        .from('tms_booking')
        // No `id`, no `status` — the live table has neither.
        .select('learner_id, travel_date, route_id, stop_id, booked_at, booked_by')
        .gte('travel_date', from)
        .lte('travel_date', to),
      svc
        .from('tms_attendance')
        .select('learner_id, trip_date, route_id, stop_id, direction, status, method, is_walk_up')
        .gte('trip_date', from)
        .lte('trip_date', to),
    ]);

    if (bookingRes.error && !isMissingTable(bookingRes.error)) {
      console.error('admin/bookings/analytics booking error:', bookingRes.error);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }
    const bookings = (bookingRes.data ?? []) as BookingRow[];

    // Attendance failing degrades that tab only — the Bookings tab still renders.
    const attUnavailable = !!attRes.error && !isMissingTable(attRes.error);
    if (attUnavailable) console.error('admin/bookings/analytics attendance error:', attRes.error);
    const attendance = attUnavailable ? [] : ((attRes.data ?? []) as AttendanceRow[]);

    const learnerIds = [
      ...new Set([...bookings.map((b) => b.learner_id), ...attendance.map((a) => a.learner_id)]),
    ];
    const learners = new Map<string, LearnerDim>();
    for (const l of await fetchByIds<LearnerRow>(
      svc,
      'learners_profiles',
      'id, profile_id, institution_id, department_id, program_id',
      learnerIds
    )) {
      learners.set(l.id, {
        id: l.id,
        profileId: l.profile_id,
        institutionId: l.institution_id,
        departmentId: l.department_id,
        programId: l.program_id,
      });
    }

    const refs = await loadPassengerRefs(svc, {
      institutionIds: [...learners.values()].map((l) => l.institutionId),
      departmentIds: [...learners.values()].map((l) => l.departmentId),
      programIds: [...learners.values()].map((l) => l.programId),
      routeIds: [...bookings.map((b) => b.route_id), ...attendance.map((a) => a.route_id)],
      stopIds: [...bookings.map((b) => b.stop_id), ...attendance.map((a) => a.stop_id)],
    });

    const labels: Labels = {
      // loadPassengerRefs returns routes as { routeNumber, routeName }; flatten to
      // the "12 · Salem Town" label the rest of the Bookings module already uses.
      routes: new Map(
        [...refs.routes].map(([id, r]) => [id, `${r.routeNumber ?? '—'} · ${r.routeName ?? ''}`.trim()])
      ),
      stops: refs.stops,
      institutions: refs.institutions,
      departments: refs.departments,
      programs: refs.programs,
    };

    // Facets BEFORE filtering — see the module docstring.
    const facets = buildFacets(bookings, attendance, learners, labels);

    const fBookings = filterBookings(bookings, learners, filters);

    // Each aggregate input is filtered to a different DEPTH. A filter selects
    // what you look at; it must never redefine what you measure against.
    // See AttendanceInput's docstring in lib/booking/analytics-attendance.ts.
    const cohortOnly = { ...filters, direction: null, attStatus: null, method: null };

    // Cohort depth, minus bookedBy: answers "did this learner have ANY booking
    // that day?" for the walk-up test. bookedBy has no attendance counterpart,
    // so letting it narrow this set reports every Self booker's boarding as a
    // walk-up.
    const bookingsForWalkUp = filterBookings(bookings, learners, {
      ...filters,
      bookedBy: null,
    });
    const attendanceForJoin = filterAttendance(attendance, learners, cohortOnly);
    const attendanceForComposition = filterAttendance(attendance, learners, filters);

    const payload: AnalyticsPayload = {
      range: { from, to },
      facets,
      bookings: aggregateBookings(fBookings, learners, labels),
      attendance: aggregateAttendance({
        bookings: fBookings,
        bookingsForWalkUp,
        // Deliberately the RAW range array — never `attendanceForJoin`. This
        // drives the scanned-route-day gate, which asks "was this route-day
        // scanned by anyone?"; any narrowing re-reads it as "was this cohort
        // scanned?" and drops the fully-no-showed days out of the denominator.
        attendanceAll: attendance,
        attendanceForJoin,
        attendanceForComposition,
        learners,
        labels,
        unavailable: attUnavailable,
      }),
    };

    return NextResponse.json({ success: true, data: payload });
  } catch (e) {
    console.error('admin/bookings/analytics error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAnalytics(request, auth));
