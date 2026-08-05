import type { SupabaseClient } from '@supabase/supabase-js';
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

interface MarkerProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

/**
 * Display names for attendance markers, keyed by profile id.
 *
 * Boarding staff share a roster — a dozen of them on route 16 — so every marked
 * row has to name who marked it, or the split work is unattributable. Nulls and
 * unresolvable ids are simply absent from the map; the caller renders a dash.
 */
export async function loadMarkerNames(
  svc: SupabaseClient,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  // ≤150 per .in() — the API gateway 400s on large filters and the failure is
  // silent, so an unchecked `{ data }` here would render EVERY marked row as
  // unattributed, which is precisely the information this feature adds.
  for (let i = 0; i < unique.length; i += 150) {
    const { data, error } = await svc
      .from('profiles')
      .select('id, full_name, email')
      .in('id', unique.slice(i, i + 150));
    if (error) {
      console.error('loadMarkerNames error:', error);
      continue;
    }
    for (const p of (data ?? []) as MarkerProfile[]) {
      out.set(p.id, (p.full_name ?? '').trim() || p.email || 'Staff');
    }
  }
  return out;
}
