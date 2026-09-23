import type { AuthContext } from '@/lib/api/with-auth';

/** True when the user holds ANY of the permissions (super admins always). */
export async function requirePerm(auth: AuthContext, ...permissions: string[]): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  for (const p of permissions) {
    const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: p });
    if (data) return true;
  }
  return false;
}
