/**
 * Automatic transport bill generation.
 *
 * Scheduled from pg_cron every 15 minutes (see the Phase 3 migration), which
 * calls this endpoint via pg_net with `Authorization: Bearer $CRON_SECRET`.
 *
 * NOT scheduled from vercel.json: no Vercel cron in this project has ever run,
 * because proxy.ts 401s /api/cron/* before the route is reached. This endpoint
 * is allowlisted there by EXACT PATH, and still uses GET so it stays portable
 * to a Vercel cron if that infrastructure is ever repaired.
 *
 * Safe to call repeatedly: generation is idempotent via tms_fee_bill_idem_unique.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { autoGenerateBills } from '@/lib/fees/auto-generate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Dry run: report what would be billed, write nothing. Auth is still required —
  // this is not a public preview.
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const summary = await autoGenerateBills(createServiceRoleClient(), { dryRun });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[auto-generate-bills] run failed', e);
    return NextResponse.json({ error: 'Auto generation run failed' }, { status: 500 });
  }
}
