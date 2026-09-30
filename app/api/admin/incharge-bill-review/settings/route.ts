import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { requirePerm } from '@/lib/auth/require-perm';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { REVIEW_SETTING_TYPE, toStoredReviewConfig, validateReviewConfig, type ReviewConfig } from '@/lib/fees/incharge-bill-review';
import { loadReviewConfig } from '@/lib/fees/incharge-bill-review-repo';

export const PUT = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = { mode: body.mode, minPersonalPct: body.minPersonalPct, minRequiredDays: body.minRequiredDays };
  const invalid = validateReviewConfig(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const next = input as ReviewConfig;

  const svc = createServiceRoleClient();
  const before = await loadReviewConfig(svc);
  const { error } = await svc.from('admin_settings').upsert(
    { setting_type: REVIEW_SETTING_TYPE, settings_data: toStoredReviewConfig(next), updated_at: new Date().toISOString(), updated_by: auth.userId },
    { onConflict: 'setting_type' },
  );
  if (error) return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });

  await logActivity(auth, request, {
    module: 'settings',
    action: 'update',
    entityType: 'admin_settings',
    entityId: REVIEW_SETTING_TYPE,
    entityLabel: 'In-charge bill review',
    description: `In-charge bill review mode ${before.mode} → ${next.mode}`,
    changes: { before, after: next },
  });
  return NextResponse.json({ success: true, data: next });
});
