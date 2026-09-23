import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { requirePerm } from '@/lib/auth/require-perm';
import { term1PaidLearnerIds } from '@/lib/fees/term1';
import { currentTransportYearId } from '@/lib/route-check/fee-facts';
import { istToday } from '@/lib/booking/window';
import {
  ROUTE_CHECK_FINE_SETTING_TYPE, loadRouteCheckFineConfig, toStoredRouteCheckFineConfig, validateRouteCheckFineInput,
  type RouteCheckFineConfig,
} from '@/lib/route-check/fine-config';

type Svc = ReturnType<typeof createServiceRoleClient>;

/** Learners the unpaid rule could fine today (not Term-1 paid, bill past due, no override), and how many are already fined this year. */
async function dryRun(svc: Svc) {
  const yearId = await currentTransportYearId(svc);
  if (!yearId) return { unpaidPastDue: 0, alreadyFinedThisYear: 0 };
  const today = istToday();
  const [paid, bills, ovr, fined] = await Promise.all([
    term1PaidLearnerIds(svc, yearId),
    svc.from('tms_fee_bill').select('person_id, due_date, status').eq('transport_year_id', yearId).eq('person_type', 'learner').eq('status', 'generated'),
    svc.from('tms_fee_override').select('person_id').eq('transport_year_id', yearId),
    svc.from('tms_fee_fine').select('person_id').eq('transport_year_id', yearId).eq('status', 'generated').like('idempotency_key', 'maintenance-unpaid:%'),
  ]);
  if (bills.error || ovr.error || fined.error) throw new Error('dry run read failed');
  const overridden = new Set((ovr.data ?? []).map((r) => (r as { person_id: string }).person_id));
  const eligible = new Set<string>();
  for (const b of (bills.data ?? []) as { person_id: string; due_date: string | null }[]) {
    if (!paid.has(b.person_id) && !overridden.has(b.person_id) && b.due_date && b.due_date < today) eligible.add(b.person_id);
  }
  return { unpaidPastDue: eligible.size, alreadyFinedThisYear: new Set((fined.data ?? []).map((r) => (r as { person_id: string }).person_id)).size };
}

async function getConfig(auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_VIEW))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const svc = createServiceRoleClient();
  try {
    return NextResponse.json({ success: true, data: { config: await loadRouteCheckFineConfig(svc), dryRun: await dryRun(svc) } });
  } catch (e) {
    console.error('route-check-fines GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function saveConfig(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_MANAGE))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
    const input = { unpaidAmount: Number(body.unpaidAmount), noBookingAmount: Number(body.noBookingAmount), fineDueDays: Number(body.fineDueDays) };
    const invalid = validateRouteCheckFineInput(input);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const svc = createServiceRoleClient();
    const before = await loadRouteCheckFineConfig(svc);
    const nowIso = new Date().toISOString();
    const turningOn = body.enabled && !before.enabled;
    const next: RouteCheckFineConfig = { enabled: body.enabled, ...input, enabledAt: turningOn ? nowIso : before.enabledAt ?? (body.enabled ? nowIso : null) };
    const { error } = await svc.from('admin_settings').upsert(
      { setting_type: ROUTE_CHECK_FINE_SETTING_TYPE, settings_data: toStoredRouteCheckFineConfig(next), updated_at: nowIso, updated_by: auth.userId },
      { onConflict: 'setting_type' },
    );
    if (error) { console.error('route-check-fines save failed:', error.message); return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 }); }
    await logActivity(auth, request, {
      module: 'settings', action: 'update', entityType: 'admin_settings', entityId: ROUTE_CHECK_FINE_SETTING_TYPE,
      entityLabel: 'Bus inspection automatic fines',
      description: `${turningOn ? 'Turned ON' : 'Updated'} bus inspection fines (unpaid ₹${next.unpaidAmount}, no booking ₹${next.noBookingAmount}, enabled: ${next.enabled})`,
      changes: { before, after: next },
    });
    return NextResponse.json({ success: true, data: { config: next } });
  } catch (e) {
    console.error('route-check-fines PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_request, auth) => getConfig(auth));
export const PUT = withAuth((request, auth) => saveConfig(request, auth));
