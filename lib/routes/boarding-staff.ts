/**
 * Boarding supervisors assigned to a route. The link is tms_staff_route_assignment
 * (keyed by lowercase staff_email; see lib/boarding/identity.ts). Each email is
 * resolved to a display name via `staff` (first+last), falling back to
 * `profiles.full_name`, then the email itself. 42P01-safe.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BoardingStaffMember {
  name: string;
  email: string;
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';

export async function getBoardingStaffForRoute(
  svc: SupabaseClient,
  routeId: string
): Promise<BoardingStaffMember[]> {
  const { data, error } = await svc
    .from('tms_staff_route_assignment')
    .select('staff_email')
    .eq('route_id', routeId)
    .eq('is_active', true);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  const emails = [
    ...new Set(
      ((data ?? []) as { staff_email: string | null }[])
        .map((r) => r.staff_email?.toLowerCase())
        .filter((e): e is string => !!e)
    ),
  ];
  if (emails.length === 0) return [];

  const nameByEmail = new Map<string, string>();

  const { data: staff } = await svc
    .from('staff')
    .select('email, first_name, last_name')
    .in('email', emails);
  for (const s of (staff ?? []) as Array<{ email: string | null; first_name: string | null; last_name: string | null }>) {
    const key = s.email?.toLowerCase();
    if (!key) continue;
    const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
    if (name) nameByEmail.set(key, name);
  }

  const unresolved = emails.filter((e) => !nameByEmail.has(e));
  if (unresolved.length > 0) {
    const { data: profs } = await svc.from('profiles').select('email, full_name').in('email', unresolved);
    for (const p of (profs ?? []) as Array<{ email: string | null; full_name: string | null }>) {
      const key = p.email?.toLowerCase();
      if (key && p.full_name) nameByEmail.set(key, p.full_name);
    }
  }

  return emails.map((email) => ({ name: nameByEmail.get(email) ?? email, email }));
}
