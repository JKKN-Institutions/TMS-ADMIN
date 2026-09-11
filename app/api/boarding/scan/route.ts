import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { verifyPass, matchPassCode } from '@/lib/boarding/pass';
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import { classifyScan, type ScanSource } from '@/lib/boarding/scan-resolve';
import { loadLearnerFeeStatus } from '@/lib/boarding/fee-status';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { hasBookingForDate, seatsRemaining } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';
import { loadAttendanceWindows, isDirectionOpen, activeDirection, formatHM, type AttDirection } from '@/lib/boarding/attendance-window';

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
  student_photo_url: string | null;
  transport_route_id: string | null;
  transport_stop_id: string | null;
}

/** One learner's result from the tms_mark_attendance RPC. */
interface ScanOutcome {
  learner_id: string;
  outcome: 'inserted' | 'updated_own' | 'overridden' | 'noop_same_status' | 'locked';
  /** The row as it was when this scan reached it. */
  existing_status: 'present' | 'absent' | null;
  existing_by: string | null;
  existing_at: string | null;
}

type MatchedBy = 'pass' | 'jkkn_id' | 'pass_code';
type Resolved = { learnerId: string; matchedBy: MatchedBy } | { error: string; status: number };

/**
 * Resolve the learner behind a scan input. Three shapes are accepted:
 *  - the signed QR / long token, whose identity is embedded and verified;
 *  - a JKKN ID from a printed card, resolved through the identity register,
 *    accepted ONLY from the camera because the number is public;
 *  - a typed 6-digit daily code, reverse-looked-up among the learners this
 *    staff may scan, so the candidate set is already authority-scoped.
 */
async function resolveLearnerId(
  raw: string,
  source: ScanSource,
  auth: AuthContext,
  svc: ReturnType<typeof createServiceRoleClient>
): Promise<Resolved> {
  // verifyPass stays the authority on the signed token: it checks the HMAC,
  // which the shape classifier deliberately does not.
  const verified = verifyPass(raw);
  if (verified) return { learnerId: verified, matchedBy: 'pass' };

  const decision = classifyScan(raw, source);

  if (decision.shape === 'jkkn_id') {
    if (decision.refusal === 'typed_jkkn_id') {
      return { error: 'Point the camera at the card to use a JKKN ID.', status: 400 };
    }
    const { data, error } = await svc
      .from('jkkn_identities')
      .select('learner_profile_id, person_kind, retired_at')
      .eq('jkkn_id', decision.code)
      .maybeSingle();
    if (error) {
      console.error('boarding scan jkkn id lookup error:', error);
      return { error: 'Could not read the identity register', status: 500 };
    }
    const row = data as { learner_profile_id: string | null; person_kind: string | null; retired_at: string | null } | null;
    if (!row) return { error: 'Card not recognised.', status: 404 };
    // Retired numbers are kept forever so they are never reissued, but a
    // retired card must never mark anyone present.
    if (row.retired_at) return { error: 'This card has been retired. Issue a new one.', status: 409 };
    if (!row.learner_profile_id) {
      // The only fact ESTABLISHED here is that the card has no learner link.
      // person_kind is what separates staff from associates and visitors, so
      // name it rather than calling every non-learner card a staff card: of
      // the 1,042 cards that reach this branch, 309 are not staff at all.
      const holder =
        row.person_kind === 'team_member' ? 'a staff member'
        : row.person_kind === 'associate' ? 'an associate'
        : row.person_kind === 'external_participant' ? 'a visitor'
        : 'someone with no learner record';
      return {
        error: `This card belongs to ${holder}, so nothing was recorded. If they are a learner, scan their bus pass QR instead.`,
        status: 409,
      };
    }
    return { learnerId: row.learner_profile_id, matchedBy: 'jkkn_id' };
  }

  if (decision.shape === 'pass_code') {
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
    const matches = matchPassCode(decision.code, candidateIds, istToday());
    if (matches.length === 1) return { learnerId: matches[0], matchedBy: 'pass_code' };
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

    const body = (await request.json().catch(() => ({}))) as {
      token?: string; direction?: string; walkUp?: boolean; source?: string;
    };
    // Optional, defaulting to 'typed'. That default can only NARROW what is
    // accepted, so an older client that has not been updated degrades to
    // today's behaviour rather than silently starting to accept cards.
    const source: ScanSource = body.source === 'camera' ? 'camera' : 'typed';
    // Attendance is onward-only. A stale client requesting the retired evening
    // leg must fail loudly rather than silently having its scan recorded as onward.
    if (body.direction && body.direction !== 'onward') {
      return NextResponse.json(
        { ok: false, error: 'Only onward (morning) attendance is supported.' },
        { status: 400 },
      );
    }
    const direction: AttDirection = 'onward';

    const svc = createServiceRoleClient();

    // Identify the learner from the QR token, a scanned JKKN ID card, or a
    // typed 6-digit code.
    const resolved = await resolveLearnerId(String(body.token ?? ''), source, auth, svc);
    if ('error' in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }
    const learnerId = resolved.learnerId;
    const matchedBy = resolved.matchedBy;

    // Time-window gate: scanning is only allowed inside the admin-configurable
    // morning window. Outside it, the scan is rejected rather than recorded.
    const windows = await loadAttendanceWindows(svc);
    if (!isDirectionOpen(windows[direction])) {
      const w = windows[direction];
      return NextResponse.json({
        ok: false,
        reason: 'window_closed',
        error: `Onward (morning) scanning is open ${formatHM(w.start)}–${formatHM(w.end)} only.`,
        activeDirection: activeDirection(windows),
      }, { status: 409 });
    }

    const { data } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, student_photo_url, transport_route_id, transport_stop_id')
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
    // them as a walk-up. Over-capacity walk-ups are ALLOWED (warning-only) — the
    // seat count is advisory, not a hard block. Booked learners skip this entirely.
    const booked = await hasBookingForDate(svc, learner.id, today);
    let isWalkUp = false;
    let overCapacity = false;
    if (!booked) {
      const seats = await seatsRemaining(svc, learner.transport_route_id, today);
      if (!body.walkUp) {
        return NextResponse.json({
          ok: false,
          reason: 'not_booked',
          seatsRemaining: seats,
          learner: { name, rollNumber: learner.roll_number },
        });
      }
      isWalkUp = true;
      overCapacity = seats <= 0;
    }

    // Atomic: decision and write in one statement (see the migration comment on
    // tms_mark_attendance). p_allow_override stays TRUE here even after PR B —
    // a scanned pass is physical proof the learner boarded, so a scan may
    // always replace an earlier mark. It only ever requests 'present', so that
    // can only ever be absent → present; a scan can never mark someone absent.
    const up = await svc.rpc('tms_mark_attendance', {
      p_marks: [
        {
          learner_id: learner.id,
          route_id: learner.transport_route_id,
          stop_id: learner.transport_stop_id,
          status: 'present',
          is_walk_up: isWalkUp,
        },
      ],
      p_trip_date: today,
      p_direction: direction,
      p_actor: auth.userId,
      p_method: matchedBy === 'jkkn_id' ? 'id_card' : 'qr_scan',
      p_allow_override: true,
    });

    if (up.error) {
      console.error('boarding scan write error:', up.error);
      return NextResponse.json({ ok: false, error: 'Failed to record attendance' }, { status: 500 });
    }

    // A re-scan of an already-present learner writes NOTHING, so credit for the
    // mark stays with whoever actually scanned them first.
    const outcome = (up.data as ScanOutcome[] | null)?.[0] ?? null;
    const alreadyPresent = outcome?.outcome === 'noop_same_status';

    // Display-only. The mark is already written, so none of these three may
    // fail the request: a failed label read must not turn a successful scan
    // into an error the staffer will retry. allSettled makes that STRUCTURAL
    // rather than relying on the Supabase client resolving transport failures
    // into { error } instead of rejecting — that is library behaviour, not a
    // guarantee, and a rejection here would have produced a 500 after the
    // attendance row already existed.
    const [routeSettled, stopSettled, feesSettled, markerNamesSettled] = await Promise.allSettled([
      svc.from('tms_route').select('route_number, route_name')
        .eq('id', learner.transport_route_id).maybeSingle(),
      learner.transport_stop_id
        ? svc.from('tms_route_stop').select('stop_name').eq('id', learner.transport_stop_id).maybeSingle()
        : Promise.resolve({ data: null }),
      loadLearnerFeeStatus(svc, learner.id),
      // Display-only, same as the two reads above: the mark is already
      // written, so a failed name lookup must fall back rather than fail
      // the request. loadMarkerNames already swallows its own per-chunk
      // errors; allSettled additionally covers a rejected promise.
      loadMarkerNames(svc, [outcome?.existing_by ?? null]),
    ]);
    const route = (routeSettled.status === 'fulfilled' ? routeSettled.value.data : null) as
      { route_number: string | null; route_name: string | null } | null;
    const routeLabel = route
      ? [route.route_number, route.route_name].filter(Boolean).join(' — ') || null
      : null;
    const stop = (stopSettled.status === 'fulfilled' ? stopSettled.value.data : null) as
      { stop_name?: string } | null;
    const stopLabel = stop?.stop_name ?? null;
    // A rejection lands on the same null the helper already returns on a failed
    // read, so the response still says "unavailable" and never a misleading 0.
    const fees = feesSettled.status === 'fulfilled' ? feesSettled.value : null;
    const markerNames = markerNamesSettled.status === 'fulfilled' ? markerNamesSettled.value : new Map<string, string>();
    // Honest, non-empty fallback: never render an empty string or a raw uuid
    // to a staffer who is trying to figure out who marked this learner first.
    const markerName = (id: string | null): string => (id && markerNames.get(id)) || 'another staff member';

    const alreadyMarked =
      outcome?.outcome === 'noop_same_status'
        ? { by: markerName(outcome.existing_by), at: outcome.existing_at }
        : undefined;
    const overrode =
      outcome?.outcome === 'overridden' && (outcome.existing_status === 'present' || outcome.existing_status === 'absent')
        ? { from: outcome.existing_status, by: markerName(outcome.existing_by), at: outcome.existing_at }
        : undefined;

    await logActivity(auth, request, {
      module: 'boarding',
      action: 'scan',
      entityType: 'tms_attendance',
      entityId: learner.id,
      entityLabel: learner.roll_number ?? name,
      description:
        `Scanned boarding pass for ${name} (${direction})${isWalkUp ? ' [walk-up]' : ''}` +
        (alreadyPresent ? ' — already present, nothing written' : '') +
        (outcome?.outcome === 'overridden' ? ` — replaced an earlier "${outcome.existing_status}" mark` : ''),
      metadata: {
        learnerId: learner.id,
        direction,
        rollNumber: learner.roll_number,
        walkUp: isWalkUp,
        outcome: outcome?.outcome ?? null,
        matchedBy,
      },
    });
    return NextResponse.json({
      ok: true,
      matchedBy,
      learner: {
        name,
        rollNumber: learner.roll_number,
        photoUrl: learner.student_photo_url,
        routeLabel,
        stopLabel,
      },
      direction,
      booked,
      walkUp: isWalkUp,
      overCapacity: overCapacity || undefined,
      alreadyPresent: alreadyPresent || undefined,
      alreadyMarked,
      overrode,
      // null, never a zeroed object: on a money panel a 0 reads as
      // "nothing owed", which is the one wrong answer that looks right.
      fees,
    });
  } catch (e) {
    console.error('boarding scan error:', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => scan(request, auth));
