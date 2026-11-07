import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/auth/require-perm';
import { UUID_RE } from '@/lib/route-check/admin';
import { PRE_TRIP_PHOTO_BUCKET } from '@/lib/tracking/pre-trip-check';
import { PHOTO_URL_TTL_SECONDS } from '@/lib/tracking/pre-trip-admin';

function idFrom(request: NextRequest) {
  // /api/admin/pre-trip-checks/<id>/photo
  return new URL(request.url).pathname.split('/').filter(Boolean)[3] ?? '';
}

/**
 * GET /api/admin/pre-trip-checks/<id>/photo — a short-lived signed URL for one
 * check's odometer photo, minted with the service key. The path comes from the row,
 * never from the caller, and the bucket has no client storage policies. Gated on
 * tms.dashboard.view, like the list.
 */
async function photoUrl(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DASHBOARD_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid check id' }, { status: 400 });

    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from('tms_pre_trip_check')
      .select('odometer_photo_path')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Check not found' }, { status: 404 });
    const path = (data as { odometer_photo_path: string | null }).odometer_photo_path;
    if (!path) return NextResponse.json({ error: 'This check has no photo (it was skipped)' }, { status: 404 });

    const { data: signed, error: signErr } = await svc.storage
      .from(PRE_TRIP_PHOTO_BUCKET)
      .createSignedUrl(path, PHOTO_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      console.error('pre-trip photo sign error:', signErr);
      return NextResponse.json({ error: 'Could not open the photo' }, { status: 500 });
    }
    return NextResponse.json(
      { success: true, data: { url: signed.signedUrl, expiresIn: PHOTO_URL_TTL_SECONDS } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('admin/pre-trip-checks photo GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => photoUrl(request, auth));
