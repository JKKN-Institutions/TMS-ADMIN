import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookableDates, cutoffFor, dayStatus, isBookingOpen, isCancelable } from '@/lib/booking/window';
import { buildMonthCells, loadExceptions, type CalendarException } from '@/lib/booking/calendar';

/**
 * Self-scoped daily booking board + book/cancel. The learner (and their route/stop)
 * are ALWAYS derived from the session — the body only carries the date + action.
 * Whole-day: one booking per learner per date authorizes both directions.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getBoard(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_SELF))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const learner = await getLearnerRowForUser(auth);
    if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });

    const dates = bookableDates();
    const svc = createServiceRoleClient();

    let routeLabel: string | null = null;
    let stopLabel: string | null = null;
    if (learner.transport_route_id) {
      const refs = await loadPassengerRefs(svc, {
        institutionIds: [],
        departmentIds: [],
        routeIds: [learner.transport_route_id],
        stopIds: [learner.transport_stop_id],
      });
      const r = refs.routes.get(learner.transport_route_id);
      routeLabel = r ? `${r.routeNumber} · ${r.routeName}` : null;
      stopLabel = learner.transport_stop_id ? refs.stops.get(learner.transport_stop_id) ?? null : null;
    }

    const svc2 = svc; // svc already created above
    const monthParam = new URL(_request.url).searchParams.get('month');

    if (monthParam) {
      if (!/^\d{4}-\d{2}$/.test(monthParam)) {
        return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
      }
      const from = `${monthParam}-01`;
      const to = `${monthParam}-${String(new Date(Date.UTC(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;

      const bookedDates = new Set<string>();
      const mres = await svc2
        .from('tms_booking')
        .select('travel_date')
        .eq('learner_id', learner.id)
        .eq('status', 'booked')
        .gte('travel_date', from)
        .lte('travel_date', to);
      if (mres.error && (mres.error as { code?: string }).code !== '42P01') {
        console.error('student/bookings GET month error:', mres.error);
        return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
      }
      for (const row of (mres.data ?? []) as { travel_date: string }[]) bookedDates.add(row.travel_date);

      const exceptions: Map<string, CalendarException> = await loadExceptions(
        svc2, learner.transport_route_id ?? null, from, to
      );
      const cells = buildMonthCells(monthParam, { bookedDates, exceptions }).map((c) => ({
        ...c,
        cutoff: c.status === 'open' || c.status === 'booked' ? cutoffFor(c.date).toISOString() : null,
      }));

      return NextResponse.json({
        success: true,
        data: { routeLabel, stopLabel, assigned: !!learner.transport_route_id, month: monthParam, cells },
      });
    }

    // Which of the horizon dates already have an active booking?
    const booked = new Set<string>();
    const res = await svc
      .from('tms_booking')
      .select('travel_date')
      .eq('learner_id', learner.id)
      .eq('status', 'booked')
      .in('travel_date', dates);
    if (res.error && (res.error as { code?: string }).code !== '42P01') {
      console.error('student/bookings GET error:', res.error);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }
    for (const row of (res.data ?? []) as { travel_date: string }[]) booked.add(row.travel_date);

    const days = dates.map((date) => ({
      date,
      status: dayStatus(booked.has(date), date),
      cutoff: cutoffFor(date).toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: { routeLabel, stopLabel, assigned: !!learner.transport_route_id, days },
    });
  } catch (e) {
    console.error('student/bookings GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function mutate(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_SELF))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const learner = await getLearnerRowForUser(auth);
    if (!learner) return NextResponse.json({ error: 'Learner profile not found' }, { status: 404 });
    if (!learner.transport_route_id) {
      return NextResponse.json({ error: 'No transport route is allocated to you yet' }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as { travel_date?: string; action?: string };
    const travelDate = String(body.travel_date ?? '');
    const action = body.action === 'cancel' ? 'cancel' : 'book';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
      return NextResponse.json({ error: 'A valid travel_date (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    if (action === 'book') {
      if (!isBookingOpen(travelDate)) {
        return NextResponse.json({ error: 'Booking is closed for that date' }, { status: 409 });
      }
      const blocking = await loadExceptions(svc, learner.transport_route_id, travelDate, travelDate);
      if (blocking.has(travelDate)) {
        return NextResponse.json({ error: 'That date is a holiday / no-service day' }, { status: 409 });
      }
      const existing = await svc
        .from('tms_booking')
        .select('id')
        .eq('learner_id', learner.id)
        .eq('travel_date', travelDate)
        .maybeSingle();
      const nowIso = new Date().toISOString();
      const writeErr = existing.data
        ? (await svc
            .from('tms_booking')
            .update({ status: 'booked', booked_at: nowIso, cancelled_at: null, updated_by: auth.userId })
            .eq('id', existing.data.id)).error
        : (await svc
            .from('tms_booking')
            .insert({
              learner_id: learner.id,
              route_id: learner.transport_route_id,
              stop_id: learner.transport_stop_id,
              travel_date: travelDate,
              status: 'booked',
              booked_at: nowIso,
              created_by: auth.userId,
              updated_by: auth.userId,
            })).error;
      if (writeErr) {
        console.error('student/bookings book error:', writeErr);
        return NextResponse.json({ error: 'Failed to book' }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: { travel_date: travelDate, status: 'booked' } });
    }

    // cancel
    if (!isCancelable(travelDate)) {
      return NextResponse.json({ error: 'Cancellation is closed for that date' }, { status: 409 });
    }
    const upd = await svc
      .from('tms_booking')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_by: auth.userId })
      .eq('learner_id', learner.id)
      .eq('travel_date', travelDate);
    if (upd.error) {
      console.error('student/bookings cancel error:', upd.error);
      return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { travel_date: travelDate, status: 'cancelled' } });
  } catch (e) {
    console.error('student/bookings POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getBoard(request, auth));
export const POST = withAuth((request, auth) => mutate(request, auth));
