/**
 * Sends the removal-bill explanation to in-charges who were removed and billed.
 *
 * The enforcement catch-up ran in `quiet` mode, so 35 people lost their role and
 * were billed without being told. This route is how they are told.
 *
 * Exactly-once by construction: each message carries the idempotency key
 * `incharge-removal-bill:<assignment_id>`, and tms_notification has a unique
 * partial index on that column. Re-running is therefore safe and reports the
 * duplicates as `alreadySent` rather than failing or double-notifying — which
 * matters, because a second copy of "you have been billed" reads as a second
 * bill.
 *
 * POST ?dryRun=1 renders every message and sends nothing.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { loadRemovalNotices } from '@/lib/boarding/incharge-removal-notice';
import {
  removalNoticeIdempotencyKey,
  splitByAlreadySent,
} from '@/lib/boarding/incharge-removal-delivery';
import { logActivityFromHeaders } from '@/lib/activity/log';

export const dynamic = 'force-dynamic';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handler(request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVERS_ASSIGN))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const svc = createServiceRoleClient();
  const notices = await loadRemovalNotices(svc);

  // Read back what has already gone out so the preview can state how many people
  // a send would ACTUALLY message. Without this a retry after a partial failure
  // would still promise the full batch, and the operator would approve a number
  // that never matched reality.
  const { data: sentRows, error: sentErr } = await svc
    .from('tms_notification')
    .select('idempotency_key')
    .like('idempotency_key', 'incharge-removal-bill:%');
  if (sentErr) {
    // Fail closed: guessing here means either double-notifying or under-reporting.
    return NextResponse.json(
      { error: 'Could not determine which notices were already sent.' },
      { status: 500 },
    );
  }
  const sentKeys = new Set(
    ((sentRows ?? []) as Array<{ idempotency_key: string | null }>)
      .map((r) => r.idempotency_key)
      .filter((k): k is string => !!k),
  );
  const split = splitByAlreadySent(notices, sentKeys);

  const summary = {
    dryRun,
    candidates: notices.length,
    sent: 0,
    alreadySent: split.alreadySent.length,
    /** Removed and billed, but with no profile to deliver to. */
    unreachable: split.unreachable.length,
    errors: 0,
    failures: split.unreachable.map((n) => ({
      staffEmail: n.staffEmail,
      message: 'no profiles row to deliver to',
    })),
    preview: [] as Array<{
      staffEmail: string;
      route: string;
      amount: number;
      title: string;
      body: string;
    }>,
  };

  // Only the pending ones: previewing a message that cannot be sent again invites
  // the operator to believe it is about to go out.
  for (const n of split.pending) {
    if (dryRun) {
      summary.preview.push({
        staffEmail: n.staffEmail,
        route: `${n.notice.routeNumber} ${n.notice.routeName}`,
        amount: n.notice.amount,
        title: n.title,
        body: n.body,
      });
      continue;
    }

    // splitByAlreadySent guarantees a profileId on every pending notice; the
    // cast documents that rather than re-checking and inflating `unreachable`,
    // which the split already counted.
    const profileId = n.profileId as string;

    try {
      const result = await dispatchNotification(svc, {
        title: n.title,
        body: n.body,
        category: 'transport',
        priority: 'high',
        // No url: every /boarding path redirects a removed in-charge to the
        // willingness toggle, so a link would land them somewhere that does not
        // mention the bill at all.
        url: null,
        createdBy: auth.userId,
        targeting: { type: 'users', user_ids: [profileId] },
        idempotencyKey: removalNoticeIdempotencyKey(n.assignmentId),
        metadata: {
          reason: 'attendance_auto_removal',
          assignment_id: n.assignmentId,
          route_number: n.notice.routeNumber,
          missed_dates: n.notice.missedDates,
          amount: n.notice.amount,
          due_date: n.notice.dueDate,
        },
      });
      if (result.id) summary.sent++;
      else summary.unreachable++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // 23505 is the idempotency index: this person already has the message.
      if (message.includes('23505') || message.toLowerCase().includes('duplicate')) {
        summary.alreadySent++;
      } else {
        summary.errors++;
        summary.failures.push({ staffEmail: n.staffEmail, message });
      }
    }
  }

  if (!dryRun && summary.sent > 0) {
    await logActivityFromHeaders(request, {
      module: 'staff-route-assignments',
      action: 'notify',
      metadata: { reason: 'attendance_auto_removal_bill', sent: summary.sent },
    });
  }

  return NextResponse.json({ success: true, data: summary });
}

export const POST = withAuth(handler);
