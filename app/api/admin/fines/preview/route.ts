import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { previewFines } from '@/lib/fines/create';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Resolve-only: what WOULD be fined, and who would be skipped and why. */
async function preview(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      transport_year_id?: string;
      person_ids?: string[];
    };
    if (!body.transport_year_id) {
      return NextResponse.json({ error: 'A transport year is required' }, { status: 400 });
    }
    const personIds = [...new Set((body.person_ids ?? []).filter(Boolean))];
    if (!personIds.length) {
      return NextResponse.json({ error: 'Select at least one learner' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const data = await previewFines(svc, {
      transportYearId: body.transport_year_id,
      personIds,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Fine preview error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => preview(request, auth));
