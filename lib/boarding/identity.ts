import type { AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Route ids the authenticated staff is actively assigned to (by their email, the
 * key tms_staff_route_assignment uses). This is the per-scan authority boundary:
 * a scanner may only mark attendance for learners on these routes.
 */
export async function getAssignedRouteIdsForUser(auth: AuthContext): Promise<string[]> {
  const { data: prof } = await auth.supabase
    .from('profiles')
    .select('email')
    .eq('id', auth.userId)
    .single();
  const email = (prof?.email as string | undefined)?.toLowerCase();
  if (!email) return [];

  const svc = createServiceRoleClient();
  const { data } = await svc
    .from('tms_staff_route_assignment')
    .select('route_id')
    .eq('staff_email', email)
    .eq('is_active', true);

  return ((data ?? []) as { route_id: string | null }[])
    .map((r) => r.route_id)
    .filter((id): id is string => !!id);
}
