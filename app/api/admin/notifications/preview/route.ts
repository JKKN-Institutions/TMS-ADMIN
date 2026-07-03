import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { estimateRecipients, normalizeTargeting } from '@/lib/notifications/audience';

/**
 * Estimate how many recipients a targeting selection resolves to — powers the
 * compose form's live "will reach N people" preview. MODERN plane, send permission.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.NOTIFICATIONS_SEND))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const raw = await request.json().catch(() => ({}));
  const targeting = normalizeTargeting((raw as { targeting?: unknown }).targeting);
  if (!targeting) return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });

  try {
    const svc = createServiceRoleClient();
    const count = await estimateRecipients(svc, targeting);
    return NextResponse.json({ success: true, data: { count } });
  } catch (e) {
    console.error('POST /api/admin/notifications/preview:', e);
    return NextResponse.json({ error: 'Failed to estimate recipients' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
