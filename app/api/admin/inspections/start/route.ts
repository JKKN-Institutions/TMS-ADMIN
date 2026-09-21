import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm, routeForVehicle } from '@/lib/inspections/server';
import { locationEvidence } from '@/lib/inspections/geo';
import { logActivity } from '@/lib/activity/log';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function startInspection(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { vehicleId?: string; lat?: unknown; lng?: unknown };
    if (!body.vehicleId) return NextResponse.json({ error: 'vehicleId is required' }, { status: 400 });
    const svc = createServiceRoleClient();

    // Resume the bus's open draft (partial unique index guarantees at most one).
    const { data: draft } = await svc.from('tms_inspection').select('id').eq('vehicle_id', body.vehicleId).eq('status', 'draft').maybeSingle();
    if (draft) return NextResponse.json({ success: true, data: { inspectionId: draft.id, resumed: true } });

    const { data: bus, error: busErr } = await svc
      .from('tms_vehicle').select('id, registration_number, current_latitude, current_longitude').eq('id', body.vehicleId).maybeSingle();
    if (busErr || !bus) return NextResponse.json({ error: 'Bus not found' }, { status: 404 });

    const lat = num(body.lat); const lng = num(body.lng);
    const busLat = num(bus.current_latitude == null ? null : Number(bus.current_latitude));
    const busLng = num(bus.current_longitude == null ? null : Number(bus.current_longitude));
    const evidence = locationEvidence(
      lat != null && lng != null ? { lat, lng } : null,
      busLat != null && busLng != null ? { lat: busLat, lng: busLng } : null,
    );
    const route = await routeForVehicle(svc, bus.id);

    const { data: created, error: insErr } = await svc.from('tms_inspection').insert({
      vehicle_id: bus.id,
      route_id: route?.id ?? null,
      driver_staff_id: route?.driver_id ?? null,
      inspected_by: auth.userId,
      inspector_lat: lat, inspector_lng: lng,
      ...evidence,
    }).select('id').single();
    if (insErr) {
      // Two taps racing: the other request created the draft — return it.
      if (insErr.code === '23505') {
        const { data: again } = await svc.from('tms_inspection').select('id').eq('vehicle_id', bus.id).eq('status', 'draft').maybeSingle();
        if (again) return NextResponse.json({ success: true, data: { inspectionId: again.id, resumed: true } });
      }
      console.error('start inspection insert error:', insErr);
      return NextResponse.json({ error: 'Failed to start inspection' }, { status: 500 });
    }

    const { data: checklist, error: clErr } = await svc
      .from('tms_inspection_checklist_item').select('id, category, label, severity, sort_order').eq('is_active', true).order('sort_order');
    if (clErr || !checklist?.length) {
      const { error: delErr } = await svc.from('tms_inspection').delete().eq('id', created.id);
      if (delErr) console.error('start inspection cleanup error:', delErr);
      return NextResponse.json({ error: 'The checklist is empty — add checklist items first' }, { status: 409 });
    }
    const { error: itemsErr } = await svc.from('tms_inspection_item').insert(
      checklist.map((c) => ({ inspection_id: created.id, checklist_item_id: c.id, category: c.category, label: c.label, severity: c.severity, sort_order: c.sort_order })),
    );
    if (itemsErr) {
      const { error: delErr } = await svc.from('tms_inspection').delete().eq('id', created.id);
      if (delErr) console.error('start inspection cleanup error:', delErr);
      console.error('start inspection items error:', itemsErr);
      return NextResponse.json({ error: 'Failed to start inspection' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'inspections', action: 'create', entityType: 'tms_inspection', entityId: created.id,
      entityLabel: bus.registration_number, description: `Started inspection of ${bus.registration_number}`,
      metadata: { ...evidence },
    });
    return NextResponse.json({ success: true, data: { inspectionId: created.id, resumed: false } });
  } catch (e) {
    console.error('start inspection error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => startInspection(request, auth));
