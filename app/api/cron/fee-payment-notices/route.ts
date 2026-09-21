/**
 * 48-hour Transport Maintenance Fee payment notice sweep.
 *
 * Scheduled from pg_cron every 5 minutes via pg_net with
 * `Authorization: Bearer $CRON_SECRET` (migration
 * 20260921120100_schedule_fee_payment_notice_sweep.sql). proxy.ts allowlists
 * this EXACT path. Safe to call repeatedly: notices are unique per learner and
 * year, and fines are idempotent on `payment-notice:<notice id>`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runPaymentNoticeSweep } from '@/lib/fees/payment-notice/sweep';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  try {
    const summary = await runPaymentNoticeSweep(createServiceRoleClient(), { dryRun });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[fee-payment-notices] run failed', e);
    return NextResponse.json({ error: 'Payment notice sweep failed' }, { status: 500 });
  }
}
