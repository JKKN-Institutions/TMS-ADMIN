import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { verifyPass, matchPassCode } from '@/lib/boarding/pass';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { hasBookingForDate, seatsRemaining } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';
import { loadAttendanceWindows, isDirectionOpen, activeDirection, formatHM } from '@/lib/boarding/attendance-window';

/**
 * POST a scanned boarding-pass token → mark the learner present for today.
 *
 * Security: requires tms.attendance.scan; the pass signature is verified
 * server-side (verifyPass); and the scanning staff must be assigned to the
 * learner's route (getAssignedRouteIdsForUser) — super admins bypass that check.
 * Idempotent per (learner, day, direction) via upsert.
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
  transport_route_id: string | null;
  transport_stop_id: string | null;
}

/**
 * Resolve the learner behind a scan input. Two shapes are accepted:
 *  - the signed QR / long token, whose identity is embedded → verified directly;
 *  - a typed 6-digit daily code, which carries no identity → reverse-looked-up
 *    among the learners this staff may scan (their assigned routes; super admins
 *    fall back to all route-allocated learners). The candidate set is therefore
 *    already authority-scoped, and matchPassCode flags collisions (>1 match).
 */
async function resolveLearnerId(
  raw: string,
  auth: AuthContext,
  svc: ReturnType<typeof createServiceRoleClient>
): Promise<{ learnerId: string } | { error: string; status: number }> {
  const verified = verifyPass(raw);
  if (verified) return { learnerId: verified };

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 6) {
    let query = svc.from('learners_profiles').select('id').not('transport_route_id', 'is', null);
    if (!auth.isSuperAdmin) {
      const routeIds = await getAssignedRouteIdsForUser(auth);
      if (routeIds.length === 0) {
        return { error: 'You are not assigned to any route', status: 403 };
      }
      query = query.in('transport_route_id', routeIds);
    }
    const { data, error } = await query;
    if (error) {
      console.error('boarding scan code lookup error:', error);
      return { error: 'Could not resolve pass code', status: 500 };
    }
    const candidateIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    const matches = matchPassCode(digits, candidateIds, istToday());
    if (matches.length === 1) return { learnerId: matches[0] };
    if (matches.length > 1) {
      return { error: 'Code matches multiple learners — please scan the QR code', status: 409 };
    }
    return { error: 'Code not recognised', status: 400 };
  }

  return { error: 'Invalid or unrecognised pass', status: 400 };
}

async function scan(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { token?: string; direction?: string; walkUp?: boolean };
    const direction = body.direction === 'return' ? 'return' : 'onward';

    const svc = createServiceRoleClient();

    // Identify the learner from the QR token or a typed 6-digit code.
    const resolved = await resolveLearnerId(String(body.token ?? ''), auth, svc);
    if ('error' in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }
    const learnerId = resolved.learnerId;

    // Time-window gate: onward only inside the morning window, return only inside
    // the evening window (admin-configurable). This is what stops an evening onward
    // re-scan from silently overwriting the morning record and dropping the return leg.
    const windows = await loadAttendanceWindows(svc);
    if (!isDirectionOpen(windows[direction])) {
      const w = windows[direction];
      return NextResponse.json({
        ok: false,
        reason: 'window_closed',
        error: `${direction === 'onward' ? 'Onward (morning)' : 'Return (evening)'} scanning is open ${formatHM(w.start)}–${formatHM(w.end)} only.`,
        activeDirection: activeDirection(windows),
      }, { status: 409 });
    }

    const { data } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, transport_route_id, transport_stop_id')
      .eq('id', learnerId)
      .maybeSingle();
    const learner = data as LearnerLite | null;
    if (!learner) {
      return NextResponse.json({ ok: false, error: 'Learner not found' }, { status: 404 });
    }
    if (!learner.transport_route_id) {
      return NextResponse.json({ ok: false, error: 'Learner has no allocated route' }, { status: 409 });
    }

    // Per-scan authority: the staff must be assigned to this learner's route.
    if (!auth.isSuperAdmin) {
      const routeIds = await getAssignedRouteIdsForUser(auth);
      if (!routeIds.includes(learner.transport_route_id)) {
        return NextResponse.json(
          { ok: false, error: "You are not assigned to this learner's route" },
          { status: 403 }
        );
      }
    }

    const today = istToday();
    const name = `${learner.first_name ?? ''} ${learner.last_name ?? ''}`.trim() || 'Learner';

    // Booking gate: a learner must have booked today, unless staff explicitly add
    // them as a walk-up (seats permitting).
    const booked = await hasBookingForDate(svc, learner.id, today);
    let isWalkUp = false;
    if (!booked) {
      if (!body.walkUp) {
        const seats = await seatsRemaining(svc, learner.transport_route_id, today);
        return NextResponse.json({
          ok: false,
          reason: 'not_booked',
          seatsRemaining: seats,
          learner: { name, rollNumber: learner.roll_number },
        });
      }
      const seats = await seatsRemaining(svc, learner.transport_route_id, today);
      if (seats <= 0) {
        return NextResponse.json({ ok: false, reason: 'bus_full', error: 'Bus is full' }, { status: 409 });
      }
      isWalkUp = true;
    }

    const up = await svc
      .from('tms_attendance')
      .upsert(
        {
          learner_id: learner.id,
          route_id: learner.transport_route_id,
          stop_id: learner.transport_stop_id,
          trip_date: today,
          direction,
          status: 'present',
          method: 'qr_scan',
          is_walk_up: isWalkUp,
          scanned_by: auth.userId,
          scanned_at: new Date().toISOString(),
        },
        { onConflict: 'learner_id,trip_date,direction' }
      )
      .select('id')
      .maybeSingle();

    if (up.error) {
      console.error('boarding scan upsert error:', up.error);
      return NextResponse.json({ ok: false, error: 'Failed to record attendance' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'boarding',
      action: 'scan',
      entityType: 'tms_attendance',
      entityId: learner.id,
      entityLabel: learner.roll_number ?? name,
      description: `Scanned boarding pass for ${name} (${direction})${isWalkUp ? ' [walk-up]' : ''}`,
      metadata: { learnerId: learner.id, direction, rollNumber: learner.roll_number, walkUp: isWalkUp },
    });
    return NextResponse.json({
      ok: true,
      learner: { name, rollNumber: learner.roll_number },
      direction,
      walkUp: isWalkUp,
    });
  } catch (e) {
    console.error('boarding scan error:', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => scan(request, auth));
