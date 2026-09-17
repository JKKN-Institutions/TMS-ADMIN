import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadConcessionRows } from '@/lib/fees/concessions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// Concession candidates for one transport year and kind.
//   /api/admin/fees/concessions?year=<transport_year_id>&kind=final_year|scheme_75
async function getConcessions(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_CONCESSION_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const year = sp.get('year');
    const kind = sp.get('kind');
    if (!year || year === 'all') {
      return NextResponse.json({ error: 'Select a transport year.' }, { status: 400 });
    }
    if (kind !== 'final_year' && kind !== 'scheme_75') {
      return NextResponse.json({ error: 'Unknown concession kind.' }, { status: 400 });
    }
    const data = await loadConcessionRows(createServiceRoleClient(), { transportYearId: year, kind });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Fee concessions API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getConcessions(request, auth));
