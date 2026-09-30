/**
 * Monthly in-charge bill review (auto-cancel of staff transport bills).
 *
 * Scheduled from pg_cron daily at 21:30 UTC (03:00 IST) via pg_net with
 * `Authorization: Bearer $CRON_SECRET` (migration 20260930120100). Reviews the
 * previous IST month unless `?month=YYYY-MM` is given. Idempotent: an applied
 * row is final, so repeated nights only refresh previews.
 *
 * `?dryRun=1` forces preview: rows are written, no bill is touched.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runInchargeBillReview } from '@/lib/fees/incharge-bill-review-repo';
import { isMonth } from '@/lib/fees/incharge-bill-review';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const month = request.nextUrl.searchParams.get('month') ?? undefined;
  if (month !== undefined && !isMonth(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const forcePreview = request.nextUrl.searchParams.get('dryRun') === '1';
  try {
    const summary = await runInchargeBillReview(createServiceRoleClient(), { month, forcePreview });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('[incharge-bill-review] run failed', e);
    return NextResponse.json({ error: 'In-charge bill review failed' }, { status: 500 });
  }
}
