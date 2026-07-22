/**
 * Daily automatic transport bill generation.
 *
 * Scheduled from vercel.json at "30 21 * * *" UTC = 03:00 IST — quiet hours,
 * after the day's data entry. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 *
 * Sweeps every ACTIVE fee structure of the CURRENT transport year through the
 * same engine as the manual Generate button (idempotent ledger, so re-runs
 * cannot double-bill), with auto policy: cross-structure conflicts are skipped
 * and empty runs write nothing. Gated by the autoGenerateBills setting — OFF
 * means the run reports skipped and writes nothing. ?dryRun=1 previews without
 * writing and deliberately ignores the toggle (see lib/fees/auto-generate.ts).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runAutoGeneration } from '@/lib/fees/auto-generate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  try {
    const summary = await runAutoGeneration(createServiceRoleClient(), { dryRun });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[auto-generate-bills] run failed', e);
    return NextResponse.json({ error: 'Auto generation run failed' }, { status: 500 });
  }
}
