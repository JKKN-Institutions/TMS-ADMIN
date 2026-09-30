import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { requirePerm } from '@/lib/auth/require-perm';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { isMonth, monthLabel } from '@/lib/fees/incharge-bill-review';
import { runInchargeBillReview } from '@/lib/fees/incharge-bill-review-repo';

export const POST = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { month?: unknown; preview?: unknown };
  const month = String(body.month ?? '');
  if (!isMonth(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  try {
    const summary = await runInchargeBillReview(createServiceRoleClient(), { month, forcePreview: body.preview !== false });
    await logActivity(auth, request, {
      module: 'fees',
      action: summary.mode === 'auto' ? 'apply' : 'generate',
      entityType: 'tms_incharge_bill_review',
      entityId: month,
      entityLabel: monthLabel(month),
      description: `In-charge bill review ${summary.mode} for ${monthLabel(month)}: ${summary.passed} pass, ${summary.failed} fail, ${summary.cancelledPeople} cancelled`,
      metadata: { ...summary },
    });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[incharge-bill-review] run failed', e);
    return NextResponse.json({ error: 'The review run failed' }, { status: 500 });
  }
});
