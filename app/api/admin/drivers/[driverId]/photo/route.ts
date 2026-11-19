import { NextResponse, type NextRequest } from 'next/server';
import { authFromRequest, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { replaceDriverPhoto } from '@/lib/drivers/edit';
import { OnboardError } from '@/lib/drivers/onboard';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (MyJKKN's limit)
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif']);

async function requireManage(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: 'tms.drivers.manage' });
  return !!data;
}

/**
 * POST a driver photo (multipart field `file`) into MyJKKN's shared staff-images
 * bucket and point staff.profile_picture at it. Only for drivers TMS fully owns.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ driverId: string }> }
) {
  try {
    const auth = authFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await requireManage(auth))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { driverId } = await params;
    if (!driverId) return NextResponse.json({ error: 'Driver id is required' }, { status: 400 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a photo to upload' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Photo must be 5MB or smaller' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: 'Only JPG, PNG or GIF photos are allowed' }, { status: 400 });
    }

    const { url } = await replaceDriverPhoto(
      createServiceRoleClient(),
      driverId,
      { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type },
      auth.userId,
      Date.now()
    );

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'update',
      entityType: 'staff',
      entityId: driverId,
      description: 'Updated driver photo',
    });
    return NextResponse.json({ success: true, data: { url } });
  } catch (e) {
    if (e instanceof OnboardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('Driver photo upload error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
