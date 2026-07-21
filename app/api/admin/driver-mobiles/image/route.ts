import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { DRIVER_MOBILE_IMAGE_BUCKET } from '@/lib/driver-mobiles/fields';
import { logActivity } from '@/lib/activity/log';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function requirePerm(auth: AuthContext, ...permissions: string[]): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  for (const p of permissions) {
    const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: p });
    if (data) return true;
  }
  return false;
}

// Keep only safe filename chars; preserve the extension.
function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const ext = (dot >= 0 ? name.slice(dot + 1) : '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return ext ? `${base || 'file'}.${ext}` : base || 'file';
}

// POST: multipart upload → returns the storage path (saved into tms_driver_mobile.image_paths).
async function uploadImage(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_CREATE, TMS_PERMISSIONS.DRIVER_MOBILES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: 'Only JPG, PNG, or WEBP images are allowed' }, { status: 400 });
    }

    // Path is NOT keyed on record id, so the same flow works for create (no id yet) and edit.
    const year = new Date().getUTCFullYear();
    const path = `${year}/${uuidv4()}-${safeName(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const supabase = createServiceRoleClient();
    const { error } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error('Driver mobile image upload error:', error);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'driver-mobiles',
      action: 'upload',
      entityType: 'tms_driver_mobile',
      description: `Uploaded driver mobile image: ${file.name}`,
      metadata: { path, fileName: file.name, fileType: file.type },
    });
    return NextResponse.json({ success: true, path });
  } catch (e) {
    console.error('Driver mobile image upload error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET ?path=… → short-lived signed URL for preview (private bucket).
async function getSignedUrl(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVER_MOBILES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const path = new URL(request.url).searchParams.get('path');
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.storage.from(DRIVER_MOBILE_IMAGE_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 404 });
    }
    return NextResponse.json({ success: true, url: data.signedUrl });
  } catch (e) {
    console.error('Driver mobile image signed-url error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => uploadImage(request, auth));
export const GET = withAuth((request, auth) => getSignedUrl(request, auth));
