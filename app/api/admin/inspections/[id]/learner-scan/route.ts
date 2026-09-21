import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';
import { istToday } from '@/lib/booking/window';
import { classifyScan } from '@/lib/boarding/scan-resolve';
import { loadLearnerFeeStatus } from '@/lib/boarding/fee-status';
import { feeBadge } from '@/lib/boarding/fee-badge';
import { learnerOutcome } from '@/lib/inspections/overview';
import { logActivity } from '@/lib/activity/log';

// /api/admin/inspections/<id>/learner-scan
const idFrom = (r: NextRequest) => new URL(r.url).pathname.split('/').filter(Boolean)[3] ?? '';

/**
 * POST { code } — VERIFY ONLY. The Transport Head scans a learner's JKKN ID
 * card on the bus and learns whether they belong there today (right bus,
 * booked, fees in order). It records the check on the inspection and NEVER
 * writes attendance. Camera reads only, as at boarding.
 */
async function scanLearner(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const decision = classifyScan(typeof body.code === 'string' ? body.code : '', 'camera');
    if (decision.shape !== 'jkkn_id' || decision.refusal) {
      return NextResponse.json({ error: 'That is not a JKKN ID card' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const { data: ins, error: insErr } = await svc.from('tms_inspection')
      .select('id, status, inspected_by, vehicle_id, route_id').eq('id', id).maybeSingle();
    if (insErr) {
      console.error('inspection learner scan: load inspection error:', insErr);
      return NextResponse.json({ error: 'Failed to load inspection' }, { status: 500 });
    }
    if (!ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    if (ins.status !== 'draft') return NextResponse.json({ error: 'This inspection is already submitted' }, { status: 409 });
    if (ins.inspected_by !== auth.userId && !auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Only the inspector who started this inspection can change it' }, { status: 403 });
    }
    if (!ins.route_id) {
      return NextResponse.json({ error: 'This bus is not on a route, so there is nothing to check the card against' }, { status: 409 });
    }
    const routeId = ins.route_id as string;

    const { data: idRow, error: idErr } = await svc.from('jkkn_identities')
      .select('learner_profile_id, retired_at').eq('jkkn_id', decision.code).maybeSingle();
    if (idErr) {
      console.error('inspection learner scan: jkkn id lookup error:', idErr);
      return NextResponse.json({ error: 'Could not read the identity register' }, { status: 500 });
    }
    const identity = idRow as { learner_profile_id: string | null; retired_at: string | null } | null;
    let learnerId = identity && !identity.retired_at ? identity.learner_profile_id : null;

    const date = istToday();
    let name: string | null = null;
    let roll: string | null = null;
    let onThisRoute = false;
    let bookedToday = false;
    let boardedToday = false;
    let feesOk = true;
    let feeLabel: string | null = null;

    if (learnerId) {
      const lid = learnerId;
      const [learnerQ, bookingQ, attendanceQ, fees] = await Promise.all([
        svc.from('learners_profiles').select('id, first_name, last_name, roll_number, transport_route_id').eq('id', lid).maybeSingle(),
        svc.from('tms_booking').select('route_id').eq('learner_id', lid).eq('travel_date', date).limit(1),
        svc.from('tms_attendance').select('learner_id').eq('learner_id', lid).eq('route_id', routeId)
          .eq('trip_date', date).eq('status', 'present').limit(1),
        // A failed fee lookup is "unknown", never "fee due" — never block on it.
        loadLearnerFeeStatus(svc, lid).catch((e) => {
          console.error('inspection learner scan: fee lookup threw:', e);
          return null;
        }),
      ]);
      if (learnerQ.error || bookingQ.error || attendanceQ.error) {
        console.error('inspection learner scan: learner lookup error:', learnerQ.error ?? bookingQ.error ?? attendanceQ.error);
        return NextResponse.json({ error: 'Failed to look up the learner' }, { status: 500 });
      }
      const learner = learnerQ.data as { first_name: string | null; last_name: string | null; roll_number: string | null; transport_route_id: string | null } | null;
      if (!learner) {
        learnerId = null; // card points at a learner record that no longer exists
      } else {
        name = `${learner.first_name ?? ''} ${learner.last_name ?? ''}`.trim() || null;
        roll = learner.roll_number;
        const booking = ((bookingQ.data ?? []) as { route_id: string }[])[0] ?? null;
        bookedToday = !!booking;
        onThisRoute = booking ? booking.route_id === routeId : learner.transport_route_id === routeId;
        boardedToday = (attendanceQ.data ?? []).length > 0;
        const badge = feeBadge(fees);
        feesOk = badge?.tone !== 'overdue';
        feeLabel = badge?.label ?? null;
      }
    }

    const known = !!learnerId;
    const outcome = learnerOutcome({ known, onThisRoute, bookedToday, feesOk });
    const { data: check, error: insCheckErr } = await svc.from('tms_inspection_learner_check').insert({
      inspection_id: id, learner_id: learnerId, jkkn_id: decision.code, outcome,
      on_this_route: known ? onThisRoute : null, booked_today: known ? bookedToday : null,
      boarded_today: known ? boardedToday : null, fees_ok: known ? feesOk : null,
    }).select('id').single();
    if (insCheckErr) {
      console.error('inspection learner scan: insert check error:', insCheckErr);
      return NextResponse.json({ error: 'Failed to record the card check' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'inspections', action: 'scan', entityType: 'tms_inspection_learner_check', entityId: check?.id ?? null,
      entityLabel: name ?? decision.code,
      description: `Inspection card check ${decision.code}${name ? ` (${name})` : ''}: ${outcome}`,
      metadata: { inspectionId: id, learnerId, outcome, onThisRoute, bookedToday, boardedToday, feesOk },
    });
    return NextResponse.json({
      success: true,
      data: { outcome, name, roll, onThisRoute, bookedToday, boardedToday, feesOk, feeLabel },
    });
  } catch (e) {
    console.error('inspection learner scan error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => scanLearner(request, auth));
