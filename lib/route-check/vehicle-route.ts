import type { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeReg } from '@/lib/vehicles/sticker-code';

type Svc = ReturnType<typeof createServiceRoleClient>;

/** A bus is on at most one active route (verified 2026-09-21); take the newest if that ever changes. */
export async function routeForVehicle(svc: Svc, vehicleId: string) {
  const { data, error } = await svc
    .from('tms_route')
    .select('id, route_number, route_name')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`routeForVehicle: ${error.message}`);
  return (data?.[0] as { id: string; route_number: string | null; route_name: string | null } | undefined) ?? null;
}

/** Vehicle whose registration normalises to the sticker's REG, or null. */
export async function vehicleByReg(svc: Svc, reg: string): Promise<{ id: string; registration_number: string } | null> {
  const want = normalizeReg(reg);
  if (!want) return null;
  const { data, error } = await svc.from('tms_vehicle').select('id, registration_number');
  if (error) throw new Error(`vehicleByReg: ${error.message}`);
  const rows = (data ?? []) as { id: string; registration_number: string | null }[];
  const hit = rows.find((v) => normalizeReg(v.registration_number ?? '') === want);
  return hit ? { id: hit.id, registration_number: hit.registration_number ?? want } : null;
}

/**
 * The route's bus id if that tms_vehicle row still exists, else null. Some
 * routes carry a stale vehicle_id (the bus row was removed); storing it on a
 * new check violates tms_route_check.vehicle_id's foreign key and blocks the
 * inspection. Throws on a read error so a real bus is never silently dropped.
 */
export async function liveVehicleId(svc: Svc, vehicleId: string | null): Promise<string | null> {
  if (!vehicleId) return null;
  const { data, error } = await svc.from('tms_vehicle').select('id').eq('id', vehicleId).limit(1);
  if (error) throw new Error(`liveVehicleId: ${error.message}`);
  return (data as { id: string }[] | null)?.length ? vehicleId : null;
}
