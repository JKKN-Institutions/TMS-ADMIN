import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'tms-vehicle-documents';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);

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

// POST: multipart upload → returns the storage path (stored in the *_document_url column).
async function uploadDocument(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, 'tms.vehicles.create', 'tms.vehicles.edit'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File must be 10MB or smaller' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: 'Only PDF, JPG, or PNG files are allowed' }, { status: 400 });
    }

    // Path is NOT keyed on vehicle id, so the same flow works for create (no id yet) and edit.
    const year = new Date().getUTCFullYear();
    const path = `${year}/${uuidv4()}-${safeName(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const supabase = createServiceRoleClient();
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error('Vehicle document upload error:', error);
      return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
    }
    return NextResponse.json({ success: true, path });
  } catch (e) {
    console.error('Vehicle document upload error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET ?path=… → short-lived signed URL for view/download (private bucket).
async function getSignedUrl(request: NextRequest) {
  try {
    const path = new URL(request.url).searchParams.get('path');
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 404 });
    }
    return NextResponse.json({ success: true, url: data.signedUrl });
  } catch (e) {
    console.error('Vehicle document signed-url error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => uploadDocument(request, auth));
export const GET = withAuth((request) => getSignedUrl(request));
