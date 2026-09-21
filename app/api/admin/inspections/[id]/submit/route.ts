import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { requirePerm } from '@/lib/inspections/server';
import { computeResult, submitBlockers, type ItemResult, type Severity } from '@/lib/inspections/result';
import { logActivity } from '@/lib/activity/log';

const idFrom = (r: NextRequest) => new URL(r.url).pathname.split('/').filter(Boolean)[3] ?? '';

async function submitInspection(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.INSPECTION_CONDUCT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = idFrom(request);
    const body = (await request.json().catch(() => ({}))) as { notes?: string | null };
    const svc = createServiceRoleClient();
    const { data: ins } = await svc.from('tms_inspection').select('id, status, inspected_by, vehicle_id').eq('id', id).maybeSingle();
    if (!ins) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    if (ins.status !== 'draft') return NextResponse.json({ error: 'This inspection is already submitted' }, { status: 409 });
    if (ins.inspected_by !== auth.userId && !auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Only the inspector who started this inspection can submit it' }, { status: 403 });
    }
    const { data: rows, error: rowsErr } = await svc.from('tms_inspection_item').select('severity, result, note, label').eq('inspection_id', id);
    if (rowsErr) {
      console.error('submit inspection error:', rowsErr);
      return NextResponse.json({ error: 'Failed to load checklist answers' }, { status: 500 });
    }
    const items = (rows ?? []) as { severity: Severity; result: ItemResult | null; note: string | null; label: string }[];
    if (items.length === 0) {
      return NextResponse.json({ error: 'This inspection has no checklist items', blockers: ['This inspection has no checklist items'] }, { status: 400 });
    }
    const blockers = submitBlockers(items);
    if (blockers.length) return NextResponse.json({ error: blockers.join('; '), blockers }, { status: 400 });

    const result = computeResult(items);
    const { data: updated, error } = await svc.from('tms_inspection')
      .update({ status: 'submitted', result, submitted_at: new Date().toISOString(), notes: body.notes?.trim() || null })
      .eq('id', id).eq('status', 'draft')
      .select('id');
    if (error) {
      console.error('submit inspection error:', error);
      return NextResponse.json({ error: 'Failed to submit inspection' }, { status: 500 });
    }
    if (!updated?.length) {
      return NextResponse.json({ error: 'This inspection is already submitted' }, { status: 409 });
    }
    const { data: bus } = await svc.from('tms_vehicle').select('registration_number').eq('id', ins.vehicle_id).maybeSingle();
    await logActivity(auth, request, {
      module: 'inspections', action: 'submit', entityType: 'tms_inspection', entityId: id,
      entityLabel: bus?.registration_number ?? null,
      description: `Submitted inspection of ${bus?.registration_number ?? 'bus'}: ${result}`,
      metadata: { result, failed: items.filter((i) => i.result === 'fail').map((i) => i.label) },
    });
    return NextResponse.json({ success: true, data: { result }, message: 'Inspection submitted' });
  } catch (e) {
    console.error('submit inspection error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => submitInspection(request, auth));
