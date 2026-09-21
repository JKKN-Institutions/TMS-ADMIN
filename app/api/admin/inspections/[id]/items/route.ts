import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';

const RESULTS = new Set(['pass', 'fail', 'na']);
const idFrom = (r: NextRequest) => new URL(r.url).pathname.split('/').filter(Boolean)[3] ?? '';

async function saveItems(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    const svc = createServiceRoleClient();
    const { data: ins } = await svc.from('tms_inspection').select('id, status, inspected_by').eq('id', id).maybeSingle();
    if (!ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    if (ins.status !== 'draft') return NextResponse.json({ error: 'This inspection is already submitted' }, { status: 409 });
    if (ins.inspected_by !== auth.userId && !auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Only the inspector who started this inspection can change it' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { items?: { id: string; result: string | null; note: string | null; photoPaths: string[] }[] };
    const items = Array.isArray(body.items) ? body.items : [];
    for (const it of items) {
      if (it.result !== null && !RESULTS.has(it.result)) return NextResponse.json({ error: 'Invalid result' }, { status: 400 });
      if (!Array.isArray(it.photoPaths) || it.photoPaths.length > 3) return NextResponse.json({ error: 'At most 3 photos per item' }, { status: 400 });
    }
    // Small batch (≤ ~25 rows): one update per row, scoped to this inspection.
    const results = await Promise.all(items.map((it) =>
      svc.from('tms_inspection_item')
        .update({ result: it.result, note: it.note?.trim() || null, photo_paths: it.photoPaths })
        .eq('id', it.id).eq('inspection_id', id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error('save inspection items error:', failed.error);
      return NextResponse.json({ error: 'Failed to save answers' }, { status: 500 });
    }
    await svc.from('tms_inspection').update({ updated_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ success: true, data: { saved: items.length } });
  } catch (e) {
    console.error('save inspection items error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PUT = withAuth((request, auth) => saveItems(request, auth));
