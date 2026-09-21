import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm, staffBrief, INSPECTION_PHOTO_BUCKET } from '@/lib/inspections/server';
import { vehicleDocStatuses } from '@/lib/inspections/doc-status';
import { istToday } from '@/lib/booking/window';
import type { InspectionDetail } from '@/lib/inspections/types';
import type { LearnerOutcome } from '@/lib/inspections/overview';

function idFrom(request: NextRequest) {
  // /api/admin/inspections/<id>
  return new URL(request.url).pathname.split('/').filter(Boolean)[3] ?? '';
}

async function getInspection(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_VIEW, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    const svc = createServiceRoleClient();
    const { data: ins } = await svc.from('tms_inspection').select('*').eq('id', id).maybeSingle();
    if (!ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

    const [busQ, routeQ, itemsQ, prevQ, inspectorQ, driver] = await Promise.all([
      svc.from('tms_vehicle').select('*').eq('id', ins.vehicle_id).single(),
      ins.route_id ? svc.from('tms_route').select('id, route_number, route_name').eq('id', ins.route_id).maybeSingle() : Promise.resolve({ data: null }),
      svc.from('tms_inspection_item').select('*').eq('inspection_id', id).order('sort_order'),
      svc.from('tms_inspection').select('id, submitted_at, result').eq('vehicle_id', ins.vehicle_id).eq('status', 'submitted')
        .neq('id', id).order('submitted_at', { ascending: false }).limit(1),
      svc.from('profiles').select('full_name').eq('id', ins.inspected_by).maybeSingle(),
      ins.driver_staff_id ? staffBrief(svc, ins.driver_staff_id) : Promise.resolve(null),
    ]);
    const bus = busQ.data as Record<string, unknown>;
    const items = (itemsQ.data ?? []) as { id: string; category: string; label: string; severity: 'critical' | 'normal'; sort_order: number; result: 'pass' | 'fail' | 'na' | null; note: string | null; photo_paths: string[] }[];

    const paths = [...new Set(items.flatMap((i) => i.photo_paths ?? []))];
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data: urls } = await svc.storage.from(INSPECTION_PHOTO_BUCKET).createSignedUrls(paths, 3600);
      for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
    // Learner ID card checks (verify-only), newest first, with names.
    const { data: checkRows, error: checksErr } = await svc.from('tms_inspection_learner_check')
      .select('id, learner_id, outcome, scanned_at').eq('inspection_id', id).order('scanned_at', { ascending: false });
    if (checksErr) {
      console.error('get inspection learner checks error:', checksErr);
      return NextResponse.json({ error: 'Failed to load learner card checks' }, { status: 500 });
    }
    const checks = (checkRows ?? []) as { id: string; learner_id: string | null; outcome: LearnerOutcome; scanned_at: string }[];
    const learnerIds = [...new Set(checks.map((c) => c.learner_id).filter((x): x is string => !!x))];
    const learners = new Map<string, { name: string | null; roll: string | null }>();
    for (let i = 0; i < learnerIds.length; i += 150) {
      const { data: lrows, error: lErr } = await svc.from('learners_profiles')
        .select('id, first_name, last_name, roll_number').in('id', learnerIds.slice(i, i + 150));
      if (lErr) {
        console.error('get inspection learner names error:', lErr);
        return NextResponse.json({ error: 'Failed to load learner card checks' }, { status: 500 });
      }
      for (const l of (lrows ?? []) as { id: string; first_name: string | null; last_name: string | null; roll_number: string | null }[]) {
        learners.set(l.id, { name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || null, roll: l.roll_number });
      }
    }

    const prev = (prevQ.data ?? [])[0] as { id: string; submitted_at: string; result: 'pass' | 'pass_with_issues' | 'fail' } | undefined;

    const data: InspectionDetail = {
      id: ins.id, status: ins.status, result: ins.result, startedAt: ins.started_at, submittedAt: ins.submitted_at, notes: ins.notes,
      inspectorName: (inspectorQ.data as { full_name?: string } | null)?.full_name ?? null,
      isMine: ins.inspected_by === auth.userId,
      location: { status: ins.location_status, distanceM: ins.bus_distance_m },
      vehicle: {
        id: String(bus.id), registration: String(bus.registration_number), model: (bus.model as string) ?? null,
        capacity: (bus.capacity as number) ?? null, status: String(bus.status),
        docs: vehicleDocStatuses(bus, istToday()), firstAidAvailable: (bus.first_aid_available as boolean) ?? null,
      },
      route: routeQ.data ? { id: routeQ.data.id, number: routeQ.data.route_number, name: routeQ.data.route_name } : null,
      driver: ins.driver_staff_id && driver ? { staffId: ins.driver_staff_id, name: driver.name, phone: driver.phone } : null,
      previous: prev ? { id: prev.id, submittedAt: prev.submitted_at, result: prev.result } : null,
      items: items.map((i) => ({
        id: i.id, category: i.category, label: i.label, severity: i.severity, sortOrder: i.sort_order,
        result: i.result, note: i.note, photoPaths: i.photo_paths ?? [],
        photoUrls: (i.photo_paths ?? []).map((p) => signed.get(p) ?? null),
      })),
      riders: {
        leg: ins.riders_leg ?? null, headcount: ins.headcount_observed ?? null,
        booked: ins.riders_booked ?? null, boarded: ins.riders_boarded ?? null,
      },
      learnerChecks: checks.map((c) => ({
        id: c.id,
        name: c.learner_id ? learners.get(c.learner_id)?.name ?? null : null,
        roll: c.learner_id ? learners.get(c.learner_id)?.roll ?? null : null,
        outcome: c.outcome, scannedAt: c.scanned_at,
      })),
    };
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('get inspection error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getInspection(request, auth));
