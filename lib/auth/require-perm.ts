import { NextResponse, type NextRequest } from 'next/server';
import { authFromRequest, type AuthContext } from '@/lib/api/with-auth';

/** True when the user holds ANY of the permissions (super admins always). */
export async function requirePerm(auth: AuthContext, ...permissions: string[]): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  for (const p of permissions) {
    const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: p });
    if (data) return true;
  }
  return false;
}

/**
 * Guard for handlers not wrapped in withAuth: null when the caller holds ANY of the
 * permissions, otherwise the 401/403 response to return.
 *
 *   const denied = await denyUnlessPerm(request, TMS_PERMISSIONS.ROUTES_EDIT);
 *   if (denied) return denied;
 */
export async function denyUnlessPerm(
  request: NextRequest,
  ...permissions: string[]
): Promise<NextResponse | null> {
  const auth = authFromRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await requirePerm(auth, ...permissions)) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
