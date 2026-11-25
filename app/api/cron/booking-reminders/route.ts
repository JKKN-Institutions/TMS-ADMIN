/**
 * Daily learner booking reminder.
 *
 * Scheduled from pg_cron at "30 11 * * *" UTC = 17:00 IST — before the default
 * 20:00 IST booking cutoff, so a reminded learner still has time to act. pg_net sends
 * `Authorization: Bearer $CRON_SECRET` (migration
 * 20261125100000_schedule_booking_reminders.sql). proxy.ts allowlists this EXACT
 * path; without that entry the request is 401'd before the check below.
 *
 * Targets ONLY transport learners with no booking for tomorrow. Idempotent per
 * (learner, date), so a retried run cannot double-notify. Respects the
 * autoNotifyPassengers setting — when off, the run reports skipped and writes nothing.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendBookingReminders } from '@/lib/booking/reminders';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Dry run: compute the audience and report it, but notify nobody. Auth is still
  // required — this is not a public preview.
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const summary = await sendBookingReminders(createServiceRoleClient(), {
      createdBy: null, // no human actor for a scheduled run
      dryRun,
    });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[booking-reminders] run failed', e);
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 });
  }
}
