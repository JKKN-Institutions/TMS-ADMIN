/**
 * Daily "Needs attention" mail to the transport heads.
 *
 * Scheduled from pg_cron at 04:30 UTC = 10:00 IST via pg_net with
 * `Authorization: Bearer $CRON_SECRET` (migration
 * 20261117100100_schedule_attention_digest.sql). proxy.ts allowlists this
 * EXACT path. Safe to call repeatedly: at most one mail goes out per IST date
 * (tms_attention_digest_log), and nothing is sent on a Sunday, a declared
 * holiday, or a day with nothing to report.
 *
 *   ?dryRun=1          returns the mail that would be sent; sends and writes nothing
 *   ?testTo=<address>  sends today's mail to that one address only; the day's
 *                      real send is unaffected
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runAttentionDigest } from '@/lib/attention-digest/run';

export const dynamic = 'force-dynamic';
// The checks are one parallel batch (about a second); the rest is the SMTP
// conversation, which the mailer caps at 30s.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const dryRun = params.get('dryRun') === '1';
  const testTo = params.get('testTo') ?? undefined;

  try {
    const summary = await runAttentionDigest(createServiceRoleClient(), { dryRun, testTo });
    // A failed send is a 500 so it is visible in the pg_net response log, not
    // only in the digest log table.
    const status = summary.outcome === 'failed' ? 500 : 200;
    return NextResponse.json({ success: status === 200, data: summary }, { status });
  } catch (e) {
    console.error('[attention-digest] run failed', e);
    return NextResponse.json({ error: 'Attention digest run failed' }, { status: 500 });
  }
}
