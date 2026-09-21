import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm, loadIntervalDays } from '@/lib/inspections/server';
import { dueInfo } from '@/lib/inspections/due';
import { istToday } from '@/lib/booking/window';
import { istDateOf } from '@/lib/booking/analytics-dims';
import type { DashboardBus, DashboardData } from '@/lib/inspections/types';
import type { InspectionResult } from '@/lib/inspections/result';

async function getDashboard(_req: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_VIEW, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();
    const [intervalDays, vehiclesQ, routesQ, inspQ, issuesQ] = await Promise.all([
      loadIntervalDays(svc),
      svc.from('tms_vehicle').select('id, registration_number, model, status').neq('status', 'retired').order('registration_number'),
      svc.from('tms_route').select('vehicle_id, route_number, route_name').eq('status', 'active').not('vehicle_id', 'is', null),
      // 35 buses × a few inspections a month: a full scan is small; newest first.
      svc.from('tms_inspection').select('id, vehicle_id, status, result, submitted_at, grounded').order('submitted_at', { ascending: false, nullsFirst: false }),
      svc.from('tms_inspection_issue').select('id', { count: 'exact', head: true }).neq('status', 'verified'),
    ]);
    if (vehiclesQ.error) {
      console.error('inspections dashboard vehicles error:', vehiclesQ.error);
      return NextResponse.json({ error: 'Failed to load buses' }, { status: 500 });
    }
    if (inspQ.error && inspQ.error.code !== '42P01') {
      console.error('inspections dashboard inspections error:', inspQ.error);
      return NextResponse.json({ error: 'Failed to load inspections' }, { status: 500 });
    }
    const routeByVehicle = new Map<string, string>();
    for (const r of (routesQ.data ?? []) as { vehicle_id: string; route_number: string | null; route_name: string | null }[]) {
      routeByVehicle.set(r.vehicle_id, [r.route_number, r.route_name].filter(Boolean).join(' · '));
    }
    type Row = { id: string; vehicle_id: string; status: string; result: InspectionResult | null; submitted_at: string | null; grounded: boolean };
    const lastByVehicle = new Map<string, Row>();
    const draftByVehicle = new Map<string, string>();
    for (const r of (inspQ.data ?? []) as Row[]) {
      if (r.status === 'draft') draftByVehicle.set(r.vehicle_id, r.id);
      else if (!lastByVehicle.has(r.vehicle_id)) lastByVehicle.set(r.vehicle_id, r);
    }
    const today = istToday();
    const buses: DashboardBus[] = ((vehiclesQ.data ?? []) as { id: string; registration_number: string; model: string | null; status: string }[]).map((v) => {
      const last = lastByVehicle.get(v.id);
      return {
        vehicleId: v.id,
        registration: v.registration_number,
        model: v.model,
        status: v.status,
        routeLabel: routeByVehicle.get(v.id) ?? null,
        lastSubmittedAt: last?.submitted_at ?? null,
        lastResult: last?.result ?? null,
        lastInspectionId: last?.id ?? null,
        draftInspectionId: draftByVehicle.get(v.id) ?? null,
        due: dueInfo(last?.submitted_at ? istDateOf(last.submitted_at) : null, intervalDays, today),
      };
    });
    const data: DashboardData = {
      intervalDays,
      tiles: {
        overdue: buses.filter((b) => b.due.state === 'overdue').length,
        dueSoon: buses.filter((b) => b.due.state === 'due_soon').length,
        never: buses.filter((b) => b.due.state === 'never').length,
        grounded: buses.filter((b) => b.status === 'maintenance').length,
        openIssues: issuesQ.count ?? 0,
      },
      buses,
    };
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('inspections dashboard error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getDashboard(request, auth));
