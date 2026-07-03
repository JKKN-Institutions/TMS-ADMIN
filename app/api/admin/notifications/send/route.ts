import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { parseComposeInput } from '@/lib/notifications/fields';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { describeTargeting } from '@/lib/notifications/audience';
import { logActivity } from '@/lib/activity/log';

/**
 * Compose & broadcast a TMS notification. MODERN plane. Validates the payload
 * (lib/notifications/fields), resolves the audience + fans out (dispatch), logs to
 * the activity trail, and returns the recipient count. Rejects a payload that
 * resolves to zero recipients so the admin isn't misled into thinking it sent.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.NOTIFICATIONS_SEND))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = parseComposeInput(raw);
  if (parsed.errors.length > 0 || !parsed.value) {
    return NextResponse.json({ error: parsed.errors.join(' ') || 'Invalid payload' }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  let result;
  try {
    result = await dispatchNotification(svc, { ...parsed.value, createdBy: auth.userId });
  } catch (e) {
    console.error('POST /api/admin/notifications/send dispatch failed:', e);
    return NextResponse.json({ error: 'Failed to send notification.' }, { status: 500 });
  }

  if (!result.id || result.recipientCount === 0) {
    return NextResponse.json(
      { error: 'The selected audience resolved to no recipients — nothing was sent.' },
      { status: 400 },
    );
  }

  await logActivity(auth, request, {
    module: 'notifications',
    action: 'create',
    entityType: 'tms_notification',
    entityId: result.id,
    entityLabel: parsed.value.title,
    description: `Sent notification "${parsed.value.title}" to ${result.recipientCount} recipient(s) — ${describeTargeting(parsed.value.targeting)}`,
    metadata: {
      recipient_count: result.recipientCount,
      category: parsed.value.category,
      priority: parsed.value.priority,
    },
  });

  return NextResponse.json({
    success: true,
    data: { id: result.id, recipientCount: result.recipientCount },
    message: `Notification sent to ${result.recipientCount} recipient(s).`,
  });
}

export const POST = withAuth((request, auth) => handlePost(request, auth));
