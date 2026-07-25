import type { AuthContext } from '@/lib/api/with-auth';

/**
 * Service-role clients bypass RLS, so both assignment routes gate writes on an
 * explicit permission check. Super admins bypass. Kept here rather than in a
 * route.ts so the single-assign and bulk routes cannot drift apart.
 */
export async function requireAssign(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', {
    permission_name: 'tms.drivers.assign',
  });
  return !!data;
}
