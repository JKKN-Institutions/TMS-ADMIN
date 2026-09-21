import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm, INSPECTION_PHOTO_BUCKET } from '@/lib/inspections/server';
import { logActivity } from '@/lib/activity/log';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const ext = (dot >= 0 ? name.slice(dot + 1) : '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return ext ? `${base || 'file'}.${ext}` : base || 'file';
}

async function uploadPhoto(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Photo must be 5MB or smaller' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Only JPG, PNG, or WEBP photos are allowed' }, { status: 400 });

    const path = `${new Date().getUTCFullYear()}/${uuidv4()}-${safeName(file.name)}`;
    const svc = createServiceRoleClient();
    const { error } = await svc.storage.from(INSPECTION_PHOTO_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (error) {
      console.error('inspection photo upload error:', error);
      return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 });
    }
    await logActivity(auth, request, {
      module: 'inspections', action: 'upload', entityType: 'tms_inspection_item',
      description: `Uploaded inspection photo: ${file.name}`, metadata: { path, fileType: file.type },
    });
    return NextResponse.json({ success: true, path });
  } catch (e) {
    console.error('inspection photo upload error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function signedUrl(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_VIEW, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const path = new URL(request.url).searchParams.get('path');
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });
    const { data, error } = await createServiceRoleClient().storage.from(INSPECTION_PHOTO_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 404 });
    return NextResponse.json({ success: true, url: data.signedUrl });
  } catch (e) {
    console.error('inspection photo signed-url error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => uploadPhoto(request, auth));
export const GET = withAuth((request, auth) => signedUrl(request, auth));
