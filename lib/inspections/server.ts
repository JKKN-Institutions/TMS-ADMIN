import type { createServiceRoleClient } from '@/lib/supabase/server';
import { parseIntervalDays } from './due';

type Svc = ReturnType<typeof createServiceRoleClient>;

export const INSPECTION_PHOTO_BUCKET = 'tms-inspection-photos';

export { requirePerm } from '@/lib/auth/require-perm';

export async function loadIntervalDays(svc: Svc): Promise<number> {
  const { data } = await svc.from('admin_settings').select('settings_data').eq('setting_type', 'inspection').maybeSingle();
  return parseIntervalDays(data?.settings_data ?? null);
}

/** A bus is on at most one active route (verified 2026-09-21); take the newest if that ever changes. */
export async function routeForVehicle(svc: Svc, vehicleId: string) {
  const { data } = await svc
    .from('tms_route')
    .select('id, route_number, route_name, driver_id')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1);
  return (data?.[0] as { id: string; route_number: string | null; route_name: string | null; driver_id: string | null } | undefined) ?? null;
}

export async function staffBrief(svc: Svc, staffId: string) {
  const { data } = await svc.from('staff').select('first_name, last_name, phone').eq('id', staffId).maybeSingle();
  if (!data) return null;
  const s = data as { first_name: string | null; last_name: string | null; phone: string | null };
  return { name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || '—', phone: s.phone ?? null };
}
