import type { createServiceRoleClient } from '@/lib/supabase/server';
import type { DriverRouteRef } from '@/types';

/**
 * Batch-resolve the assigned route(s) for a set of drivers, for display in the admin
 * Drivers module. A driver↔route link can come from EITHER admin screen:
 *   - tms_route.driver_id = staff.id   (Routes → Edit → "Driver" dropdown)
 *   - tms_driver.assigned_route_id     (Drivers → Edit → "Assigned Route")
 * Both are honored and de-duped. Each ref also carries the route's bus
 * (registration number). Three queries total regardless of driver count.
 */

type RouteRow = {
  id: string;
  route_number: string | null;
  route_name: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
};

function label(r: { route_number: string | null; route_name: string | null }): string {
  return `${r.route_number ?? '?'} · ${r.route_name ?? ''}`.trim();
}

export async function getRoutesForDrivers(
  svc: ReturnType<typeof createServiceRoleClient>,
  drivers: { staffId: string; assignedRouteId: string | null }[]
): Promise<Map<string, DriverRouteRef[]>> {
  const result = new Map<string, DriverRouteRef[]>();
  if (drivers.length === 0) return result;

  const staffIds = drivers.map((d) => d.staffId);
  const assignedIds = [...new Set(drivers.map((d) => d.assignedRouteId).filter(Boolean))] as string[];

  // Route side: every route whose driver_id is one of these staff ids.
  const routeSideRes = await svc
    .from('tms_route')
    .select('id, route_number, route_name, driver_id, vehicle_id')
    .in('driver_id', staffIds);
  const routeSide = (routeSideRes.data ?? []) as RouteRow[];

  // Driver side: the routes referenced by tms_driver.assigned_route_id.
  const assignedRes = assignedIds.length
    ? await svc.from('tms_route').select('id, route_number, route_name, vehicle_id').in('id', assignedIds)
    : { data: [] as Omit<RouteRow, 'driver_id'>[] };
  const assignedRows = (assignedRes.data ?? []) as Omit<RouteRow, 'driver_id'>[];

  // The bus on each route (tms_route.vehicle_id). A few routes point at vehicles
  // that no longer exist; those resolve to null and show as "no bus".
  const vehicleIds = [...new Set([...routeSide, ...assignedRows].map((r) => r.vehicle_id).filter(Boolean))] as string[];
  const vehicleRes = vehicleIds.length
    ? await svc.from('tms_vehicle').select('id, registration_number').in('id', vehicleIds)
    : { data: [] as { id: string; registration_number: string | null }[] };
  const busById = new Map(
    ((vehicleRes.data ?? []) as { id: string; registration_number: string | null }[]).map((v) => [v.id, v.registration_number])
  );
  const ref = (r: Omit<RouteRow, 'driver_id'>): DriverRouteRef => ({
    id: r.id,
    label: label(r),
    bus: r.vehicle_id ? busById.get(r.vehicle_id) ?? null : null,
  });
  const assignedMap = new Map<string, DriverRouteRef>(assignedRows.map((r) => [r.id, ref(r)]));

  const routeSideByStaff = new Map<string, RouteRow[]>();
  for (const r of routeSide) {
    if (!r.driver_id) continue;
    const arr = routeSideByStaff.get(r.driver_id) ?? [];
    arr.push(r);
    routeSideByStaff.set(r.driver_id, arr);
  }

  for (const d of drivers) {
    const refs: DriverRouteRef[] = [];
    const seen = new Set<string>();
    for (const r of routeSideByStaff.get(d.staffId) ?? []) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        refs.push(ref(r));
      }
    }
    if (d.assignedRouteId && !seen.has(d.assignedRouteId)) {
      const assigned = assignedMap.get(d.assignedRouteId);
      if (assigned) {
        seen.add(assigned.id);
        refs.push(assigned);
      }
    }
    result.set(d.staffId, refs);
  }
  return result;
}
