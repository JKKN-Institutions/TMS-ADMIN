import type { AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Resolve the tms_driver row for the authenticated user, session-derived only.
 *   1. tms_driver.profile_id = auth.userId         (backfilled from staff.profile_id)
 *   2. profiles.id -> staff.profile_id -> tms_driver.staff_id   (canonical fallback)
 */
export interface DriverRow {
  id: string;
  staff_id: string | null;
  license_number: string | null;
  license_expiry: string | null;
  driver_status: string | null;
  experience_years: number | null;
  rating: number | null;
  total_trips: number | null;
  assigned_route_id: string | null;
}

const DRIVER_SELECT =
  'id, staff_id, license_number, license_expiry, driver_status, experience_years, rating, total_trips, assigned_route_id';

export async function getDriverForUser(auth: AuthContext): Promise<DriverRow | null> {
  const svc = createServiceRoleClient();

  const byFk = await svc
    .from('tms_driver')
    .select(DRIVER_SELECT)
    .eq('profile_id', auth.userId)
    .maybeSingle();
  if (byFk.data) return byFk.data as unknown as DriverRow;

  const st = await svc.from('staff').select('id').eq('profile_id', auth.userId).maybeSingle();
  const staffId = (st.data as { id: string } | null)?.id;
  if (!staffId) return null;

  const byStaff = await svc
    .from('tms_driver')
    .select(DRIVER_SELECT)
    .eq('staff_id', staffId)
    .maybeSingle();
  return (byStaff.data as unknown as DriverRow) ?? null;
}
