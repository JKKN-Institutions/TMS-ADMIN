import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { applyRouteImport } from '@/lib/routes/import-routes';
import type { ParsedRoute } from '@/lib/routes/parse-route-workbook';

/**
 * Bulk route import. Accepts pre-parsed routes (parsed client-side by
 * lib/routes/parse-route-workbook) and upserts them via the shared
 * applyRouteImport write path.
 *
 * Mirrors app/api/admin/drivers/import: gate on the TMS permission, then use the
 * service-role client (bypasses RLS) for the actual writes.
 */
async function importRoutesOp(request: NextRequest, auth: AuthContext) {
  try {
    if (!auth.isSuperAdmin) {
      const { data: canCreate } = await auth.supabase.rpc('user_has_permission', {
        permission_name: 'tms.routes.create',
      });
      if (!canCreate) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json();
    const routes: ParsedRoute[] = Array.isArray(body?.routes) ? body.routes : [];
    if (routes.length === 0) {
      return NextResponse.json({ error: 'routes is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const result = await applyRouteImport(supabase, routes, { userId: auth.userId });
    return NextResponse.json(result);
  } catch (e) {
    console.error('Route import error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => importRoutesOp(request, auth));
