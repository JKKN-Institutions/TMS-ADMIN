import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { requirePerm } from '@/lib/auth/require-perm';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { selectByIds } from '@/lib/supabase/chunked';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday } from '@/lib/booking/window';
import { isMonth, monthBounds, previousMonth } from '@/lib/fees/incharge-bill-review';
import { loadReviewConfig } from '@/lib/fees/incharge-bill-review-repo';

export type ReviewRowDto = {
  person_id: string;
  name: string;
  staff_code: string | null;
  routes: string[];
  required_days: number;
  route_days: number;
  personal_days: number;
  personal_pct: number;
  missed_route_dates: string[];
  outcome: 'passed' | 'failed' | 'not_enough_days';
  reason: string;
  mode: 'preview' | 'auto';
  applied: boolean;
  bill_action: 'none' | 'cancelled';
  outstanding_amount: number;
  cancelled_amount: number;
  error: string | null;
  decided_at: string;
};

export const GET = withAuth(async (request: NextRequest, auth: AuthContext) => {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const month = request.nextUrl.searchParams.get('month') ?? previousMonth(istToday());
  if (!isMonth(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  const { first, last } = monthBounds(month);
  const svc = createServiceRoleClient();

  try {
    const [config, reviewRes, excusedRes] = await Promise.all([
      loadReviewConfig(svc),
      svc.from('tms_incharge_bill_review').select('*').eq('month', first),
      svc.from('tms_incharge_excused_day').select('day, reason').gte('day', first).lte('day', last).order('day'),
    ]);
    if (reviewRes.error) throw reviewRes.error;
    if (excusedRes.error) throw excusedRes.error;

    const raw = (reviewRes.data ?? []) as Array<Record<string, unknown>>;
    const staff = await selectByIds<{ id: string; first_name: string | null; last_name: string | null; staff_id: string | null; email: string | null }>(
      svc, 'staff', 'id, first_name, last_name, staff_id, email', raw.map((r) => r.person_id as string),
    );
    const staffById = new Map(staff.map((s) => [s.id, s]));
    const routeIds = [...new Set(raw.flatMap((r) => (r.route_ids as string[]) ?? []))];
    const routes = await selectByIds<{ id: string; route_number: string | null }>(svc, 'tms_route', 'id, route_number', routeIds);
    const routeNo = new Map(routes.map((r) => [r.id, r.route_number ?? '?']));

    const rows: ReviewRowDto[] = raw.map((r) => {
      const s = staffById.get(r.person_id as string);
      return {
        person_id: r.person_id as string,
        name: s ? [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || '—' : '—',
        staff_code: s?.staff_id ?? null,
        routes: ((r.route_ids as string[]) ?? []).map((id) => routeNo.get(id) ?? '?'),
        required_days: Number(r.required_days),
        route_days: Number(r.route_days),
        personal_days: Number(r.personal_days),
        personal_pct: Number(r.personal_pct),
        missed_route_dates: (r.missed_route_dates as string[]) ?? [],
        outcome: r.outcome as ReviewRowDto['outcome'],
        reason: r.reason as string,
        mode: r.mode as ReviewRowDto['mode'],
        applied: r.applied === true,
        bill_action: r.bill_action as ReviewRowDto['bill_action'],
        outstanding_amount: Number(r.outstanding_amount),
        cancelled_amount: Number(r.cancelled_amount),
        error: (r.error as string | null) ?? null,
        decided_at: r.decided_at as string,
      };
    });

    return NextResponse.json({ success: true, data: { month, config, excused: excusedRes.data ?? [], rows } });
  } catch (e) {
    console.error('[incharge-bill-review] GET failed', e);
    return NextResponse.json({ error: 'Failed to load the bill review' }, { status: 500 });
  }
});
