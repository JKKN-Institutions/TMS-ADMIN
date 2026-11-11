import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { denyUnlessPerm } from '@/lib/auth/require-perm';
import { selectByIds } from '@/lib/supabase/chunked';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istDateOf, normEmail, isMonth, monthBounds } from '@/lib/fees/incharge-bill-review';
import type { AbsenceRow } from '@/lib/boarding/share-coverage';
import {
  buildMarkingReport, monthDays, toYearRows, type InchargeInput, type MarkingRow, type RawMarks, type YearRow,
} from '@/lib/attendance/incharge-marking';

export interface InchargeMarkingResponse {
  month: string;
  direction: 'onward' | 'return';
  today: string;
  days: string[];
  rows: MarkingRow[];
}

export interface InchargeYearResponse {
  year: string;
  direction: 'onward' | 'return';
  today: string;
  /** 'YYYY-MM' for every month of the year up to the current one. */
  months: string[];
  rows: YearRow[];
}

interface StaffRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  institution_email: string | null;
  profile_id: string | null;
}

/**
 * GET /api/admin/attendance/incharges?month=YYYY-MM&direction=onward|return
 * GET /api/admin/attendance/incharges?year=YYYY&direction=onward|return
 *   (the year form returns a summary per in-charge per month, no day cells)
 *
 * The In-charge marking report: for every active in-charge assignment, each
 * day of the month classified as marked / marked by others / not marked / on
 * leave / no service. One call serves both the day view and the month grid.
 *
 * Every failed read is a 500, never an empty list: "nobody marked" is a claim
 * the transport office acts on.
 */
export async function GET(request: NextRequest) {
  try {
    const denied = await denyUnlessPerm(request, TMS_PERMISSIONS.ATTENDANCE_VIEW);
    if (denied) return denied;

    const sp = new URL(request.url).searchParams;
    const today = istToday();
    const yearParam = sp.get('year');
    if (yearParam !== null && !/^\d{4}$/.test(yearParam)) {
      return NextResponse.json({ error: 'year must be YYYY' }, { status: 400 });
    }
    const month = sp.get('month') ?? today.slice(0, 7);
    if (!yearParam && !isMonth(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    const dirParam = sp.get('direction') ?? 'onward';
    if (dirParam !== 'onward' && dirParam !== 'return') {
      return NextResponse.json({ error: 'direction must be onward or return' }, { status: 400 });
    }
    const direction = dirParam;
    const { first, last } = yearParam
      ? { first: `${yearParam}-01-01`, last: `${yearParam}-12-31` }
      : monthBounds(month);
    // Every date of the range; days after today are classified 'na' and cost nothing.
    const yearMonths = yearParam
      ? Array.from({ length: 12 }, (_, i) => `${yearParam}-${String(i + 1).padStart(2, '0')}`).filter((m) => m <= today.slice(0, 7))
      : [];
    const days = yearParam ? yearMonths.flatMap(monthDays) : monthDays(month);

    const svc = createServiceRoleClient();
    const fail = (what: string, error: unknown) => {
      console.error(`In-charge marking: ${what} failed:`, error);
      return NextResponse.json({ error: `Failed to load ${what}` }, { status: 500 });
    };

    const [asgRes, routeRes, staffRes, calRes, excRes, absRes, marksRes] = await Promise.all([
      svc.from('tms_staff_route_assignment').select('id, staff_email, route_id, assigned_at, created_at').eq('is_active', true),
      svc.from('tms_route').select('id, route_number, route_name'),
      svc.from('staff').select('id, first_name, last_name, email, institution_email, profile_id'),
      svc.from('tms_service_calendar').select('exception_date, route_id').gte('exception_date', first).lte('exception_date', last),
      svc.from('tms_incharge_excused_day').select('day').gte('day', first).lte('day', last),
      svc.from('tms_incharge_absence')
        .select('assignment_id, absence_date, covering_assignment_id, cover_status')
        .gte('absence_date', first).lte('absence_date', last),
      svc.rpc('tms_incharge_marking_report', { p_from: first, p_to: last, p_direction: direction }),
    ]);
    if (asgRes.error) return fail('assignments', asgRes.error);
    if (routeRes.error) return fail('routes', routeRes.error);
    if (staffRes.error) return fail('staff', staffRes.error);
    if (calRes.error) return fail('service calendar', calRes.error);
    if (excRes.error) return fail('excused days', excRes.error);
    if (absRes.error) return fail('absences', absRes.error);
    if (marksRes.error) return fail('marks', marksRes.error);

    const routes = new Map(
      ((routeRes.data ?? []) as Array<{ id: string; route_number: string | null; route_name: string | null }>)
        .map((r) => [r.id, r] as const),
    );

    // Staff are known by up to three addresses; index every one of them.
    const staff = (staffRes.data ?? []) as StaffRow[];
    const profileIds = staff.map((s) => s.profile_id).filter((v): v is string => !!v);
    let profiles: Array<{ id: string; email: string | null; full_name: string | null }> = [];
    try {
      profiles = await selectByIds(svc, 'profiles', 'id, email, full_name', profileIds);
    } catch (e) {
      return fail('profiles', e);
    }
    const profileById = new Map(profiles.map((p) => [p.id, p] as const));
    const staffByEmail = new Map<string, StaffRow>();
    for (const s of staff) {
      const pe = s.profile_id ? profileById.get(s.profile_id)?.email ?? null : null;
      for (const e of [s.email, s.institution_email, pe]) {
        const n = normEmail(e);
        if (n && !staffByEmail.has(n)) staffByEmail.set(n, s);
      }
    }

    const incharges: InchargeInput[] = [];
    for (const a of (asgRes.data ?? []) as Array<{
      id: string; staff_email: string | null; route_id: string; assigned_at: string | null; created_at: string | null;
    }>) {
      const email = normEmail(a.staff_email);
      if (!email) continue;
      const s = staffByEmail.get(email);
      const profile = s?.profile_id ? profileById.get(s.profile_id) : undefined;
      const emails = new Set<string>([email]);
      for (const e of [s?.email, s?.institution_email, profile?.email]) {
        const n = normEmail(e);
        if (n) emails.add(n);
      }
      const staffName = s ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() : '';
      const route = routes.get(a.route_id);
      const stamp = a.assigned_at ?? a.created_at;
      incharges.push({
        assignmentId: a.id,
        routeId: a.route_id,
        routeNumber: route?.route_number ?? null,
        routeName: route?.route_name ?? null,
        name: staffName || (profile?.full_name ?? '').trim() || email,
        email,
        emails,
        profileId: s?.profile_id ?? null,
        startDate: stamp ? istDateOf(stamp) : first,
      });
    }

    const rows = buildMarkingReport({
      days,
      today,
      incharges,
      marks: marksRes.data as RawMarks,
      calendarOff: ((calRes.data ?? []) as Array<{ exception_date: string; route_id: string | null }>)
        .map((c) => ({ date: c.exception_date, routeId: c.route_id })),
      excused: ((excRes.data ?? []) as Array<{ day: string }>).map((e) => e.day),
      absences: (absRes.data ?? []) as AbsenceRow[],
    });
    rows.sort((x, y) =>
      String(x.routeNumber ?? '').localeCompare(String(y.routeNumber ?? ''), undefined, { numeric: true }) ||
      x.name.localeCompare(y.name),
    );

    if (yearParam) {
      const data: InchargeYearResponse = { year: yearParam, direction, today, months: yearMonths, rows: toYearRows(rows, yearMonths) };
      return NextResponse.json({ success: true, data });
    }
    const data: InchargeMarkingResponse = { month, direction, today, days, rows };
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('In-charge marking API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
