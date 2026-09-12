import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import { classifyScan, type ScanSource } from '@/lib/boarding/scan-resolve';
import { loadLearnerFeeStatus } from '@/lib/boarding/fee-status';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { hasBookingForDate, seatsRemaining } from '@/lib/booking/repo';
import { istToday } from '@/lib/booking/window';
import { loadAttendanceWindows, activeDirection, type AttDirection } from '@/lib/boarding/attendance-window';
import { judgeTappedAt } from '@/lib/boarding/tapped-at';
import { REJECT_REASON_TEXT } from '@/lib/boarding/offline/protocol';

/**
 * POST a scanned JKKN ID card → mark the learner present for today.
 *
 * Security: requires tms.attendance.scan; the pass signature is verified
 * the card is resolved through jkkn_identities; and the scanning staff must be assigned to the
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

type MatchedBy = 'jkkn_id';
type Resolved = { learnerId: string; matchedBy: MatchedBy } | { error: string; status: number };

/**
 * Resolve the learner behind a scan. ONE credential is accepted: the printed
 * JKKN ID card, read by camera. The number is public (printed on plastic and
 * downloadable as a PNG from MyJKKN), so a TYPED one is refused — a camera read
 * is the evidence of physical possession.
 *
 * The transport boarding pass and its six-digit daily code were retired on
 * 2026-09-12. Both now fall through to "unrecognised" here; historic rows they
 * wrote keep method 'qr_scan' and are untouched.
 */
async function resolveLearnerId(
  raw: string,
  source: ScanSource,
  svc: ReturnType<typeof createServiceRoleClient>
): Promise<Resolved> {
  const decision = classifyScan(raw, source);

  if (decision.refusal === 'typed_jkkn_id') {
    return { error: 'Point the camera at the card to use a JKKN ID.', status: 400 };
  }
  if (decision.shape !== 'jkkn_id') {
    return { error: 'Not a JKKN ID card. Scan the card, or mark the learner by hand.', status: 400 };
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
      error: `This card belongs to ${holder}, so nothing was recorded. If they are a learner, mark them by hand.`,
      status: 409,
    };
  }
  return { learnerId: row.learner_profile_id, matchedBy: 'jkkn_id' };
}

async function scan(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      token?: string; direction?: string; walkUp?: boolean; source?: string;
      tappedAt?: string; clientId?: string;
    };
    // Optional, defaulting to 'typed'. That default can only NARROW what is
    // accepted, so an older client that has not been updated degrades to
    // today's behaviour rather than silently starting to accept cards.
    const source: ScanSource = body.source === 'camera' ? 'camera' : 'typed';

    const svc = createServiceRoleClient();

    // Identify the learner from the QR token, a scanned JKKN ID card, or a
    // typed 6-digit code.
    const resolved = await resolveLearnerId(String(body.token ?? ''), source, svc);
    if ('error' in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }
    const learnerId = resolved.learnerId;
    const matchedBy = resolved.matchedBy;

    // Which trip, and whether scanning is open at all. The server clock decides;
    // a scanner that names a different trip is on a stale screen and is refused
    // rather than silently recorded on the other trip. See trip-direction.ts.
    const windows = await loadAttendanceWindows(svc);
    // Judged at the moment of the SCAN. A scan queued on a bus with no signal
    // arrives late; it counts if it was scanned inside its trip's window today.
    // With no tappedAt this is the same check as before, at arrival.
    const tap = judgeTappedAt(body.tappedAt, new Date(), windows, body.direction);
    if (!tap.ok) {
      // Keep evening attendance's reason names for the existing scan screen.
      const reason =
        tap.reason === 'outside_window' ? 'window_closed'
        : tap.reason === 'invalid' && !body.tappedAt ? 'bad_direction'
        : tap.reason;
      return NextResponse.json({
        ok: false,
        clientId: body.clientId ?? null,
        reason,
        error: tap.error ?? REJECT_REASON_TEXT[tap.reason],
        activeDirection: activeDirection(windows),
      }, { status: tap.reason === 'invalid' ? 400 : 409 });
    }
    const direction: AttDirection = tap.direction;

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

    // The IST date of the scan. Identical to istToday() for a live scan.
    const today = tap.tripDate;
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
        // The staffer is deciding right now whether to add this learner as a
        // walk-up, so show their fee position here too. A failed or rejected
        // read becomes null ("unavailable"): it must never turn this reply into
        // an error, because that would hide the walk-up button.
        const fees = await loadLearnerFeeStatus(svc, learner.id).catch(() => null);
        return NextResponse.json({
          ok: false,
          clientId: body.clientId ?? null,
          reason: 'not_booked',
          seatsRemaining: seats,
          learner: { name, rollNumber: learner.roll_number },
          fees,
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
          scanned_at: tap.at.toISOString(),
        },
      ],
      p_trip_date: today,
      p_direction: direction,
      p_actor: auth.userId,
      // The card is the only credential now, so every new scan is an id_card.
      p_method: 'id_card',
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
      clientId: body.clientId ?? null,
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
