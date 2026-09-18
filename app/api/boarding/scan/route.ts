import { NextResponse, after, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { getAssignedRouteIdsForUser, loadMarkerNames } from '@/lib/boarding/identity';
import { classifyScan, type ScanSource } from '@/lib/boarding/scan-resolve';
import { loadLearnerFeeStatus } from '@/lib/boarding/fee-status';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { getBookingForDate, seatsRemaining } from '@/lib/booking/repo';
import { decideBus, type WrongBusKind } from '@/lib/boarding/wrong-bus';
import { loadAttendanceWindows, activeDirection, type AttDirection } from '@/lib/boarding/attendance-window';
import { judgeTappedAt } from '@/lib/boarding/tapped-at';
import { REJECT_REASON_TEXT } from '@/lib/boarding/offline/protocol';
import { loadMarkingMode, allowedMethods } from '@/lib/boarding/marking-mode';

/**
 * POST a scanned JKKN ID card → mark the learner present for today.
 *
 * Security: requires tms.attendance.scan; the card is resolved through
 * jkkn_identities; and the scanner must be assigned to a bus
 * (getAssignedRouteIdsForUser; super admins have none and bypass it).
 *
 * The mark is recorded on the bus the learner BOARDED: the scanner's bus. A
 * learner booked on, or allocated to, another bus is still recorded there,
 * and the reply says so (wrongBus) — owner ruling 2026-09-17, because the card
 * read is proof they travelled. See lib/boarding/wrong-bus.ts.
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
type Resolved =
  | { learnerId: string; matchedBy: MatchedBy }
  // `reason` is a short code the phone turns into a spoken refusal
  // (refusalAnnouncement in lib/boarding/announce.ts). The text stays the panel's.
  | { error: string; status: number; reason: string };

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
    return { error: 'Point the camera at the card to use a JKKN ID.', status: 400, reason: 'typed_card' };
  }
  if (decision.shape !== 'jkkn_id') {
    return { error: 'Not a JKKN ID card. Scan the card, or mark the learner by hand.', status: 400, reason: 'not_a_card' };
  }

  const { data, error } = await svc
    .from('jkkn_identities')
    .select('learner_profile_id, person_kind, retired_at')
    .eq('jkkn_id', decision.code)
    .maybeSingle();
  if (error) {
    console.error('boarding scan jkkn id lookup error:', error);
    return { error: 'Could not read the identity register', status: 500, reason: 'register_failed' };
  }
  const row = data as { learner_profile_id: string | null; person_kind: string | null; retired_at: string | null } | null;
  if (!row) return { error: 'Card not recognised.', status: 404, reason: 'card_unknown' };
  // Retired numbers are kept forever so they are never reissued, but a
  // retired card must never mark anyone present.
  if (row.retired_at) return { error: 'This card has been retired. Issue a new one.', status: 409, reason: 'card_retired' };
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
      reason: 'not_learner_card',
    };
  }
  return { learnerId: row.learner_profile_id, matchedBy: 'jkkn_id' };
}

async function scan(request: NextRequest, auth: AuthContext) {
  // Server-Timing, so the time a scan spends here can be read in the phone's
  // or the laptop's network panel.
  const t0 = performance.now();
  const marks: string[] = [];
  const mark = (name: string) => marks.push(`${name};dur=${(performance.now() - t0).toFixed(0)}`);
  try {
    const body = (await request.json().catch(() => ({}))) as {
      token?: string; direction?: string; walkUp?: boolean; source?: string;
      tappedAt?: string; clientId?: string;
    };
    // Optional, defaulting to 'typed'. That default can only NARROW what is
    // accepted, so an older client that has not been updated degrades to
    // today's behaviour rather than silently starting to accept cards.
    const source: ScanSource = body.source === 'camera' ? 'camera' : 'typed';

    const svc = createServiceRoleClient();

    // Speed: these reads do not depend on each other, so they run together
    // instead of one after another. Every gate below is still judged in the
    // same order as before and nothing is written until all of them pass —
    // the only difference is that the card lookup has already happened when a
    // caller without the scan permission is refused.
    const [canScan, scanExempt, markingMode, resolved, windows] = await Promise.all([
      requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN),
      auth.isSuperAdmin || requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_OVERRIDE),
      loadMarkingMode(svc),
      resolveLearnerId(String(body.token ?? ''), source, svc),
      loadAttendanceWindows(svc),
    ]);
    mark('gates');

    if (!canScan) {
      return NextResponse.json({ ok: false, reason: 'forbidden', error: 'Forbidden' }, { status: 403 });
    }

    // Settings → Marking method. Manual only switches scanning off for ordinary
    // staff; the transport office keeps it.
    if (!allowedMethods(markingMode, scanExempt).scan) {
      return NextResponse.json(
        { ok: false, clientId: body.clientId ?? null, reason: 'scan_off', error: REJECT_REASON_TEXT.scan_off },
        { status: 409 },
      );
    }

    // The learner behind the scanned JKKN ID card.
    if ('error' in resolved) {
      return NextResponse.json({ ok: false, reason: resolved.reason, error: resolved.error }, { status: resolved.status });
    }
    const learnerId = resolved.learnerId;
    const matchedBy = resolved.matchedBy;

    // Which trip, and whether scanning is open at all. The server clock decides;
    // a scanner that names a different trip is on a stale screen and is refused
    // rather than silently recorded on the other trip. See trip-direction.ts.
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
    // The IST date of the scan. Identical to istToday() for a live scan.
    const today = tap.tripDate;

    // Again independent of each other, so fetched together.
    const [learnerRes, routeIds, booking] = await Promise.all([
      svc
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number, student_photo_url, transport_route_id, transport_stop_id')
        .eq('id', learnerId)
        .maybeSingle(),
      auth.isSuperAdmin ? Promise.resolve(null) : getAssignedRouteIdsForUser(auth),
      getBookingForDate(svc, learnerId, today),
    ]);
    mark('learner');
    const learner = learnerRes.data as LearnerLite | null;
    if (!learner) {
      return NextResponse.json({ ok: false, reason: 'learner_not_found', error: 'Learner not found' }, { status: 404 });
    }

    // Per-scan authority and the bus: the scanner must be on a bus, and the
    // mark goes on that bus. routeIds is null only for a super admin.
    const bus = decideBus({
      staffRouteIds: routeIds,
      allocatedRouteId: learner.transport_route_id,
      allocatedStopId: learner.transport_stop_id,
      booking,
    });
    if (!bus.ok) {
      const status = bus.error === 'Learner has no allocated route' ? 409 : 403;
      return NextResponse.json(
        { ok: false, reason: status === 409 ? 'no_route' : 'not_your_bus', error: bus.error },
        { status },
      );
    }
    const { busRouteId, wrongBus, bookedRouteId } = bus.decision;
    const booked = booking !== null;

    const name = `${learner.first_name ?? ''} ${learner.last_name ?? ''}`.trim() || 'Learner';

    // ── Booking state: RECORDED, never a gate ──
    // This used to answer `not_booked` and write NOTHING until the staffer
    // tapped "Add as walk-up" on the result panel. On a moving bus that second
    // tap is often not made, so the riders who most need accounting for — the
    // ones travelling without a booking — were exactly the ones left unmarked.
    //
    // A scan is physical proof the learner boarded, so it now always records,
    // flagged is_walk_up. `body.walkUp` is still accepted from older clients
    // but no longer decides anything: the booking lookup does.
    //
    // Over capacity stays a WARNING on the response, never a refusal — the seat
    // count is advisory (a bus that is full still carried them).
    const isWalkUp = bus.decision.walkUp;
    const overCapacity =
      isWalkUp && (await seatsRemaining(svc, busRouteId, today)) <= 0;

    // Atomic: decision and write in one statement (see the migration comment on
    // tms_mark_attendance). p_allow_override stays TRUE here even after PR B —
    // a scanned pass is physical proof the learner boarded, so a scan may
    // always replace an earlier mark. It only ever requests 'present', so that
    // can only ever be absent → present; a scan can never mark someone absent.
    const up = await svc.rpc('tms_mark_attendance', {
      p_marks: [
        {
          learner_id: learner.id,
          // The bus boarded. move_route also moves an existing row here (for
          // example the auto-absent row written on the booked bus), so the
          // mark shows on the list of the bus the learner is actually on.
          route_id: busRouteId,
          stop_id: bus.decision.stopId,
          move_route: true,
          booked_route_id: bookedRouteId,
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

    mark('write');
    if (up.error) {
      console.error('boarding scan write error:', up.error);
      return NextResponse.json({ ok: false, reason: 'write_failed', error: 'Failed to record attendance' }, { status: 500 });
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
    const routeIdsToName = [...new Set([learner.transport_route_id, wrongBus?.routeId].filter((id): id is string => !!id))];
    const [routeSettled, stopSettled, feesSettled, markerNamesSettled] = await Promise.allSettled([
      routeIdsToName.length
        ? svc.from('tms_route').select('id, route_number, route_name').in('id', routeIdsToName)
        : Promise.resolve({ data: [] }),
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
    const namedRoutes = ((routeSettled.status === 'fulfilled' ? routeSettled.value.data : null) ?? []) as
      Array<{ id: string; route_number: string | null; route_name: string | null }>;
    // The learner's own route, as the panel has always shown it.
    const route = namedRoutes.find((r) => r.id === learner.transport_route_id) ?? null;
    const wrongBusReply: { kind: WrongBusKind; routeNumber: string | null } | undefined = wrongBus
      ? { kind: wrongBus.kind, routeNumber: namedRoutes.find((r) => r.id === wrongBus.routeId)?.route_number ?? null }
      : undefined;
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

    mark('details');

    // The mark is written; the audit entry must not hold the staffer's screen.
    // after() runs it once the response has gone. Outside a request scope
    // after() throws, so fall back to fire-and-forget (as dispatch.ts does).
    const writeLog = () => logActivity(auth, request, {
      module: 'boarding',
      action: 'scan',
      entityType: 'tms_attendance',
      entityId: learner.id,
      entityLabel: learner.roll_number ?? name,
      description:
        `Scanned boarding pass for ${name} (${direction})${isWalkUp ? ' [walk-up]' : ''}` +
        (alreadyPresent ? ' — already present, nothing written' : '') +
        (outcome?.outcome === 'overridden' ? ` — replaced an earlier "${outcome.existing_status}" mark` : '') +
        (wrongBusReply
          ? wrongBusReply.kind === 'booked_other_bus'
            ? ` — wrong bus: booked on bus ${wrongBusReply.routeNumber ?? '?'}`
            : ` — wrong bus: belongs to bus ${wrongBusReply.routeNumber ?? '?'}`
          : ''),
      metadata: {
        learnerId: learner.id,
        direction,
        rollNumber: learner.roll_number,
        walkUp: isWalkUp,
        outcome: outcome?.outcome ?? null,
        matchedBy,
        busRouteId,
        wrongBus: wrongBus ?? null,
      },
    });
    try {
      after(writeLog);
    } catch {
      void writeLog();
    }

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
      // Said aloud and shown on the panel: "booked on bus N" / "belongs to bus N".
      wrongBus: wrongBusReply,
      overCapacity: overCapacity || undefined,
      alreadyPresent: alreadyPresent || undefined,
      alreadyMarked,
      overrode,
      // null, never a zeroed object: on a money panel a 0 reads as
      // "nothing owed", which is the one wrong answer that looks right.
      fees,
    }, { headers: { 'Server-Timing': marks.join(', ') } });
  } catch (e) {
    console.error('boarding scan error:', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => scan(request, auth));
