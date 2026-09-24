import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { requirePerm } from '@/lib/auth/require-perm';
import { currentTransportYearId, loadLearnerFeeFacts } from '@/lib/route-check/fee-facts';
import { summariseFeeDryRun, type FeeDryRun } from '@/lib/route-check/fine-dry-run';
import { istToday } from '@/lib/booking/window';
import {
  ROUTE_CHECK_FINE_SETTING_TYPE, loadRouteCheckFineConfig, toStoredRouteCheckFineConfig, validateRouteCheckFineInput,
  type RouteCheckFineConfig,
} from '@/lib/route-check/fine-config';

type Svc = ReturnType<typeof createServiceRoleClient>;

/**
 * "If a check ran today": how many learners the unpaid rule WOULD fine if an
 * inspector scanned them. Runs the same fee facts + decideFeeFine as submit
 * (earliest-term due date, running 48h window, override), and treats any
 * existing maintenance-unpaid fine this year (any status) as already fined —
 * exactly what submit's pre-check does.
 */
async function dryRun(svc: Svc): Promise<FeeDryRun> {
  const yearId = await currentTransportYearId(svc);
  if (!yearId) return { unpaidPastDue: 0, inNoticeWindow: 0, alreadyFinedThisYear: 0, unreadable: 0 };
  const [bills, fined] = await Promise.all([
    svc.from('tms_fee_bill').select('person_id').eq('transport_year_id', yearId).eq('person_type', 'learner').eq('status', 'generated'),
    svc.from('tms_fee_fine').select('person_id').eq('transport_year_id', yearId).like('idempotency_key', `maintenance-unpaid:${yearId}:%`),
  ]);
  if (bills.error || fined.error) throw new Error('dry run read failed');
  const ids = [...new Set((bills.data ?? []).map((r) => (r as { person_id: string }).person_id))];
  const { facts } = await loadLearnerFeeFacts(svc, ids);
  const finedIds = new Set((fined.data ?? []).map((r) => (r as { person_id: string }).person_id));
  return summariseFeeDryRun(facts, finedIds, { today: istToday(), now: new Date() });
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
