import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import {
  FEE_NOTICE_SETTING_TYPE, loadFeeNoticeConfig, toStoredFeeNoticeConfig, validateFeeNoticeInput,
  type FeeNoticeConfig,
} from '@/lib/fees/payment-notice/config';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getConfig(auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_VIEW))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const config = await loadFeeNoticeConfig(createServiceRoleClient());
  return NextResponse.json({ success: true, data: { config } });
}

async function saveConfig(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
    }
    const input = {
      windowHours: Number(body.windowHours),
      reminderHoursBefore: Number(body.reminderHoursBefore),
      fineDueDays: Number(body.fineDueDays),
    };
    const invalid = validateFeeNoticeInput(input);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const svc = createServiceRoleClient();
    const before = await loadFeeNoticeConfig(svc);
    const nowIso = new Date().toISOString();
    const turningOn = body.enabled && !before.enabled;
    const next: FeeNoticeConfig = {
      enabled: body.enabled,
      ...input,
      enabledAt: turningOn ? nowIso : before.enabledAt,
    };

    const { error } = await svc.from('admin_settings').upsert(
      {
        setting_type: FEE_NOTICE_SETTING_TYPE,
        settings_data: toStoredFeeNoticeConfig(next),
        updated_at: nowIso,
        updated_by: auth.userId,
      },
      { onConflict: 'setting_type' },
    );
    if (error) {
      console.error('fee-payment-notice settings save failed:', error.message);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    let restarted = 0;
    if (turningOn) {
      const { data: rows, error: rErr } = await svc
        .from('tms_fee_payment_notice')
        .update({
          expires_at: new Date(Date.parse(nowIso) + next.windowHours * 3_600_000).toISOString(),
          reminder_sent_at: null,
          updated_at: nowIso,
        })
        .eq('status', 'running')
        .select('id');
      if (rErr) console.error('fee-payment-notice restart failed:', rErr.message);
      restarted = (rows ?? []).length;
    }

    await logActivity(auth, request, {
      module: 'settings',
      action: 'update',
      entityType: 'admin_settings',
      entityId: FEE_NOTICE_SETTING_TYPE,
      entityLabel: '48-hour fee payment notice',
      description: turningOn
        ? `Turned the 48-hour fee payment notice ON (${restarted} running notices restarted)`
        : `Updated the 48-hour fee payment notice (enabled: ${next.enabled})`,
      changes: { before, after: next },
    });

    return NextResponse.json({ success: true, data: { config: next } });
  } catch (e) {
    console.error('fee-payment-notice settings error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_request, auth) => getConfig(auth));
export const PUT = withAuth((request, auth) => saveConfig(request, auth));
