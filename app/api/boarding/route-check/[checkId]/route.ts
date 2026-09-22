import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { UUID_RE } from '@/lib/route-check/admin';
import { checkIdFromUrl, loadCheckForUser } from '@/lib/route-check/check-access';
import { buildCheckView } from '@/lib/route-check/view';

async function getView(request: NextRequest, auth: AuthContext) {
  try {
    const id = checkIdFromUrl(request.url);
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });
    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, id, 'read');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const data = await buildCheckView(svc, load.check);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('route-check view error:', e);
    return NextResponse.json({ error: 'Failed to load the check' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getView(request, auth));
