import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { geocodeAddress, GEOCODE_MIN_INTERVAL_MS } from '@/lib/geo/geocode';

/**
 * POST /api/admin/route-optimization/geocode-stops  Body: { limit?: number }
 *
 * Geocodes a batch of stops that have no lat/long yet (default 40 per call,
 * throttled for the provider's rate limit), writing latitude/longitude back to
 * tms_route_stop. Returns counts + how many still remain so the client can loop.
 * Once stops are geocoded, the optimizer's proximity matching activates.
 * Requires tms.routes.edit.
 */
async function canEdit(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', {
    permission_name: TMS_PERMISSIONS.ROUTES_EDIT,
  });
  return !!data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await canEdit(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const limitRaw = Number(body?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.round(limitRaw))) : 40;

  try {
    const supabase = createServiceRoleClient();
    const { data: stops, error } = await supabase
      .from('tms_route_stop')
      .select('id, stop_name')
      .is('latitude', null)
      .limit(limit);
    if (error) throw new Error(error.message);

    let geocoded = 0;
    let failed = 0;
    for (const s of stops ?? []) {
      if (!s.stop_name) { failed++; continue; }
      const r = await geocodeAddress(s.stop_name);
      if (!r) { failed++; await sleep(GEOCODE_MIN_INTERVAL_MS); continue; }
      const { error: updErr } = await supabase
        .from('tms_route_stop')
        .update({ latitude: r.lat, longitude: r.long })
        .eq('id', s.id);
      if (updErr) failed++;
      else geocoded++;
      await sleep(GEOCODE_MIN_INTERVAL_MS);
    }

    const { count: remaining } = await supabase
      .from('tms_route_stop')
      .select('id', { count: 'exact', head: true })
      .is('latitude', null);

    return NextResponse.json({ success: true, result: { geocoded, failed, remaining: remaining ?? 0 } });
  } catch (e) {
    console.error('route-optimization: geocode failed', e);
    return NextResponse.json({ error: 'Failed to geocode stops' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
