import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';
import { istToday } from '@/lib/booking/window';
import { logActivity } from '@/lib/activity/log';
import type { Leg } from '@/lib/inspections/overview';

// /api/admin/inspections/<id>/headcount
const idFrom = (r: NextRequest) => new URL(r.url).pathname.split('/').filter(Boolean)[3] ?? '';

/**
 * PUT { leg, counted } — the Transport Head's people count, snapshotted with
 * the server's booked/boarded numbers for today and that leg, so the report
 * can show counted vs boarded as they stood at the time of the inspection.
 */
async function saveHeadcount(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    const body = (await request.json().catch(() => ({}))) as { leg?: unknown; counted?: unknown };
    if (body.leg !== 'onward' && body.leg !== 'return') {
      return NextResponse.json({ error: 'Choose the morning or evening trip' }, { status: 400 });
    }
    const leg: Leg = body.leg;
    const counted = body.counted === undefined ? null : body.counted;
    if (counted !== null && (typeof counted !== 'number' || !Number.isInteger(counted) || counted < 0 || counted > 500)) {
      return NextResponse.json({ error: 'The headcount must be a whole number from 0 to 500' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const { data: ins, error: insErr } = await svc.from('tms_inspection')
      .select('id, status, inspected_by, vehicle_id, route_id').eq('id', id).maybeSingle();
    if (insErr) {
      console.error('inspection headcount: load inspection error:', insErr);
      return NextResponse.json({ error: 'Failed to load inspection' }, { status: 500 });
    }
    if (!ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    if (ins.status !== 'draft') return NextResponse.json({ error: 'This inspection is already submitted' }, { status: 409 });
    if (ins.inspected_by !== auth.userId && !auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Only the inspector who started this inspection can change it' }, { status: 403 });
    }

    // No route → nothing to compare against; the count is still kept.
    let booked: number | null = null;
    let boarded: number | null = null;
    if (ins.route_id) {
      const date = istToday();
      const [bookedQ, boardedQ] = await Promise.all([
        svc.from('tms_booking').select('learner_id', { count: 'exact', head: true })
          .eq('route_id', ins.route_id).eq('travel_date', date),
        svc.from('tms_attendance').select('learner_id', { count: 'exact', head: true })
          .eq('route_id', ins.route_id).eq('trip_date', date).eq('direction', leg).eq('status', 'present'),
      ]);
      if (bookedQ.error || boardedQ.error) {
        console.error('inspection headcount: rider count error:', bookedQ.error ?? boardedQ.error);
        return NextResponse.json({ error: 'Failed to count booked and boarded riders' }, { status: 500 });
      }
      booked = bookedQ.count ?? 0;
      boarded = boardedQ.count ?? 0;
    }

    const { data: updated, error: upErr } = await svc.from('tms_inspection')
      .update({ headcount_observed: counted, riders_booked: booked, riders_boarded: boarded, riders_leg: leg })
      .eq('id', id).eq('status', 'draft')
      .select('id');
    if (upErr) {
      console.error('inspection headcount: update error:', upErr);
      return NextResponse.json({ error: 'Failed to save the headcount' }, { status: 500 });
    }
    if (!updated?.length) return NextResponse.json({ error: 'This inspection is already submitted' }, { status: 409 });

    const { data: bus } = await svc.from('tms_vehicle').select('registration_number').eq('id', ins.vehicle_id).maybeSingle();
    const reg = (bus as { registration_number?: string } | null)?.registration_number ?? 'bus';
    await logActivity(auth, request, {
      module: 'inspections', action: 'update', entityType: 'tms_inspection', entityId: id,
      entityLabel: reg,
      description: `Headcount on ${reg}: counted ${counted ?? 'not entered'}, boarded ${boarded ?? 'n/a'}`,
      metadata: { leg, counted, booked, boarded },
    });
    return NextResponse.json({ success: true, data: { counted, booked, boarded } });
  } catch (e) {
    console.error('inspection headcount error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PUT = withAuth((request, auth) => saveHeadcount(request, auth));
