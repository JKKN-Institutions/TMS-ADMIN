import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { UUID_RE } from '@/lib/route-check/admin';
import { checkIdFromUrl, loadCheckForUser } from '@/lib/route-check/check-access';
import { previewCheckFines } from '@/lib/route-check/fines';

/**
 * GET — what submitting this draft would fine right now (Submit dialog).
 * Read-only: runs the same rules as submit but raises nothing.
 */
async function preview(request: NextRequest, auth: AuthContext) {
  try {
    const id = checkIdFromUrl(request.url);
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Route check not found' }, { status: 404 });
    const svc = createServiceRoleClient();
    const load = await loadCheckForUser(auth, svc, id, 'read');
    if (!load.ok) return NextResponse.json({ error: load.error }, { status: load.status });
    const data = await previewCheckFines(svc, { id, route_id: load.check.route_id, check_date: load.check.check_date });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('route-check fine preview error:', e);
    return NextResponse.json({ error: 'Could not work out the fines' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => preview(request, auth));
