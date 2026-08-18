import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLearnerRowForUser } from '@/lib/student/identity';
import { loadPassengerRefs } from '@/lib/passengers/refs';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { addDays, bookableDates, deadlineFor, dayStatus, isCancelable, isSunday, istToday } from '@/lib/booking/window';
import { bookedCount, routeCapacity, hasBookingForDate } from '@/lib/booking/repo';
import { isOverCapacity } from '@/lib/booking/capacity';
import { buildMonthCells, loadExceptions, loadWindows, effectiveOpen, type CalendarException, type WindowOverride } from '@/lib/booking/calendar';
import { loadSchedulingConfig, toWindowOpts } from '@/lib/settings/scheduling';

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

    const svc = createServiceRoleClient();
    const cfg = await loadSchedulingConfig(svc);
    // See toWindowOpts() in lib/settings/scheduling.ts for the cutoffHour: 24
    // sentinel semantics used when the daily time-window is disabled.
    const winOpts = toWindowOpts(cfg);
    // The walk needs to know which days are NOT service days before it can pick
    // the next WORKING day, so load the service calendar across the whole 21-day
    // search cap — not just the month being viewed.
    const today = istToday();
    // Range starts at TODAY, not tomorrow: with same-day booking enabled the walk
    // can offer today, and a holiday declared for today must still exclude it. The
    // extra day costs nothing and removes the whole "today's holiday is invisible"
    // failure mode regardless of how the flag is set.
    const horizonExceptions = await loadExceptions(
      svc, learner.transport_route_id ?? null, today, addDays(today, 21)
    );
    const offDates = new Set(horizonExceptions.keys());
    const dates = bookableDates(new Date(), { ...winOpts, offDates });

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

    const monthParam = new URL(_request.url).searchParams.get('month');

    if (monthParam) {
      if (!/^\d{4}-\d{2}$/.test(monthParam)) {
        return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
      }
      const from = `${monthParam}-01`;
      const to = `${monthParam}-${String(new Date(Date.UTC(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;

      const bookedDates = new Set<string>();
      const mres = await svc
        .from('tms_booking')
        .select('travel_date')
        .eq('learner_id', learner.id)
        // (status filter removed — presence = booked)
        .gte('travel_date', from)
        .lte('travel_date', to);
      if (mres.error && (mres.error as { code?: string }).code !== '42P01') {
        console.error('student/bookings GET month error:', mres.error);
        return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
      }
      for (const row of (mres.data ?? []) as { travel_date: string }[]) bookedDates.add(row.travel_date);

      const exceptions: Map<string, CalendarException> = await loadExceptions(
        svc, learner.transport_route_id ?? null, from, to
      );
      const windows: Map<string, WindowOverride> = await loadWindows(
        svc, learner.transport_route_id ?? null, from, to
      );

      // Already-marked attendance for the month, grouped by date. Powers the hover
      // tooltip on each day (direction · status · marked time). Non-fatal on error
      // so the board still renders even if attendance can't be read.
      type AttRow = { trip_date: string; direction: string | null; status: string | null; method: string | null; scanned_at: string | null };
      const attendance = new Map<string, { direction: string; status: string; method: string; scannedAt: string }[]>();
      const ares = await svc
        .from('tms_attendance')
        .select('trip_date, direction, status, method, scanned_at')
        .eq('learner_id', learner.id)
        .gte('trip_date', from)
        .lte('trip_date', to)
        .order('scanned_at', { ascending: true });
      if (ares.error && (ares.error as { code?: string }).code !== '42P01') {
        console.error('student/bookings GET attendance error:', ares.error);
      }
      for (const r of (ares.data ?? []) as AttRow[]) {
        const list = attendance.get(r.trip_date) ?? [];
        list.push({ direction: r.direction ?? '', status: r.status ?? '', method: r.method ?? '', scannedAt: r.scanned_at ?? '' });
        attendance.set(r.trip_date, list);
      }

      const cells = buildMonthCells(monthParam, { ...winOpts, bookedDates, exceptions, windows, offDates }).map((c) => ({
        ...c,
        cutoff: c.status === 'open' || c.status === 'booked'
          ? (windows.get(c.date)?.deadline ?? deadlineFor(c.date, new Date(), winOpts).toISOString())
          : null,
        attendance: attendance.get(c.date),
      }));

      return NextResponse.json({
        success: true,
        data: {
          routeLabel,
          stopLabel,
          assigned: !!learner.transport_route_id,
          month: monthParam,
          cells,
          maxBookableDate: dates[dates.length - 1] ?? null,
          nextBookableDate: dates[0] ?? null,
          // The EFFECTIVE cutoff hour, so the UI can state the real deadline
          // instead of hardcoding one. null = the daily time window is disabled.
          cutoffHour: cfg.enableBookingTimeWindow ? cfg.cutoffHour : null,
          // Non-null only when same-day booking is ON, so the UI can state the
          // deadline that actually governs TODAY rather than the prior-day one.
          sameDayCutoffHour:
            cfg.allowSameDayBooking && cfg.enableBookingTimeWindow ? cfg.sameDayCutoffHour : null,
          todayBookable: dates[0] === istToday(),
        },
      });
    }

    // Which of the horizon dates already have an active booking?
    const booked = new Set<string>();
    const res = await svc
      .from('tms_booking')
      .select('travel_date')
      .eq('learner_id', learner.id)
      // (status filter removed — presence = booked)
      .in('travel_date', dates);
    if (res.error && (res.error as { code?: string }).code !== '42P01') {
      console.error('student/bookings GET error:', res.error);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }
    for (const row of (res.data ?? []) as { travel_date: string }[]) booked.add(row.travel_date);

    const days = dates.map((date) => ({
      date,
      status: dayStatus(booked.has(date), date, new Date(), { ...winOpts, offDates }),
      cutoff: deadlineFor(date, new Date(), winOpts).toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        routeLabel,
        stopLabel,
        assigned: !!learner.transport_route_id,
        days,
        maxBookableDate: dates[dates.length - 1] ?? null,
        nextBookableDate: dates[0] ?? null,
        cutoffHour: cfg.enableBookingTimeWindow ? cfg.cutoffHour : null,
        sameDayCutoffHour:
          cfg.allowSameDayBooking && cfg.enableBookingTimeWindow ? cfg.sameDayCutoffHour : null,
        todayBookable: dates[0] === istToday(),
      },
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

    // Loaded once, above the book/cancel branch, so BOTH paths agree on the
    // same effective cutoff/horizon — see window.test.ts for the regression
    // this guards (a booking that book() allows but cancel() used to reject).
    const cfg = await loadSchedulingConfig(svc);
    const winOpts = toWindowOpts(cfg);

    if (action === 'book') {
      if (isSunday(travelDate)) {
        return NextResponse.json({ error: 'Sunday is a weekly holiday — buses do not run that day' }, { status: 409 });
      }
      // Load the service calendar across the walk's 21-day cap. The horizon now
      // SKIPS holidays, so a holiday date is simply absent from bookableDates —
      // this check must run BEFORE effectiveOpen or the specific "that date is a
      // holiday" message would be masked by the generic "booking is closed".
      const today = istToday();
      const horizonExceptions = await loadExceptions(
        svc, learner.transport_route_id, today, addDays(today, 21)
      );
      if (horizonExceptions.has(travelDate)) {
        return NextResponse.json({ error: 'That date is a holiday / no-service day' }, { status: 409 });
      }
      const offDates = new Set(horizonExceptions.keys());

      const winMap = await loadWindows(svc, learner.transport_route_id, travelDate, travelDate);
      const openOpts = { window: winMap.get(travelDate), ...winOpts, offDates };
      if (!effectiveOpen(travelDate, openOpts)) {
        return NextResponse.json({ error: 'Booking is closed for that date' }, { status: 409 });
      }
      // Capacity is advisory: an over-capacity booking is ALLOWED and only flagged
      // (warning), never blocked. Overflow is intentional. Compute the flag only
      // when the learner takes a NEW seat — a rebooking never counts as over capacity.
      let overCapacity = false;
      let bookedNow = 0;
      let cap = 0;
      const holdsSeat = await hasBookingForDate(svc, learner.id, travelDate);
      if (!holdsSeat) {
        cap = winMap.get(travelDate)?.capacityOverride ?? (await routeCapacity(svc, learner.transport_route_id));
        bookedNow = await bookedCount(svc, learner.transport_route_id, travelDate);
        overCapacity = isOverCapacity(bookedNow, cap);
      }

      const upErr = (await svc
        .from('tms_booking')
        .upsert(
          {
            learner_id: learner.id,
            route_id: learner.transport_route_id,
            stop_id: learner.transport_stop_id,
            travel_date: travelDate,
            booked_at: new Date().toISOString(),
            booked_by: auth.userId,
          },
          { onConflict: 'learner_id,travel_date' }
        )).error;
      if (upErr) {
        console.error('student/bookings book error:', upErr);
        return NextResponse.json({ error: 'Failed to book' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        data: {
          travel_date: travelDate,
          status: 'booked',
          overCapacity,
          // this learner is the (bookedNow + 1)th seat; only sent when over capacity
          booked: overCapacity ? bookedNow + 1 : undefined,
          capacity: overCapacity ? cap : undefined,
        },
      });
    }

    // cancel — isCancelable() deliberately does NOT consult the booking horizon.
    // With a single-working-day window, a horizon-scoped rule would strand every
    // pre-existing forward booking with no way to release the seat. A booking is
    // cancellable while its travel date is future and its cutoff is still open.
    // Sunday is not gated: a pre-existing Sunday booking must stay cancellable.
    if (!isCancelable(travelDate, new Date(), winOpts)) {
      return NextResponse.json({ error: 'Cancellation is closed for that date' }, { status: 409 });
    }
    const del = await svc
      .from('tms_booking')
      .delete()
      .eq('learner_id', learner.id)
      .eq('travel_date', travelDate);
    if (del.error) {
      console.error('student/bookings cancel error:', del.error);
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
