/**
 * Month-end bus in-charge verdict.
 *
 * The counterpart to the daily loop, and the sole authority over money and
 * roles. For each active in-charge: was the route marked on EVERY service day of
 * the window? Pass cancels their transport bill; fail makes it payable, revokes
 * the assignment and locks them out until they pay or accept a new commitment.
 *
 * The daily job warns; this decides. Splitting it that way means nobody is
 * punished twice for the same missed days.
 *
 * Two gates stand in front of any action:
 *   - `inchargeEnforcementMode` (admin_settings). Ships as 'shadow', which
 *     records verdicts but cancels, bills, revokes and notifies nobody.
 *   - `dryRun=1`, which writes nothing at all.
 *
 * Blast radius, measured 2026-08-18: under the zero-miss rule NO route was
 * marked on every day it carried riders, so a live run bills all 102 in-charges
 * about Rs 13 lakh. That consequence was chosen deliberately and is recorded in
 * the design doc -- but it is why the first live run must be a human pressing a
 * button, never this job waking up on its own.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { istToday } from '@/lib/booking/window';
import { notifyProfile } from '@/lib/notifications/notify';
import { maybeRevokeBoardingRole } from '@/lib/boarding/roles';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { generateStaffBill } from '@/lib/fees/staff-bill';
import { cancelStaffBills, makeStaffBillsPayable } from '@/lib/fees/cancel-staff-bill';
import { serviceDays, evaluateMonth, monthWindow } from '@/lib/boarding/incharge-month';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const monthParam = request.nextUrl.searchParams.get('month');
  if (monthParam !== null && !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  const today = istToday();
  const anchor = monthParam ? `${monthParam}-01` : today;
  const window = monthWindow(anchor);

  const cfg = await loadSchedulingConfig(svc);
  const mode = cfg.inchargeEnforcementMode;
  const act = mode === 'enforce' && !dryRun;

  if (mode === 'off') {
    return NextResponse.json({ success: true, data: { month: window, mode, skipped: 'mode_off' } });
  }

  const summary = {
    month: monthParam ?? anchor.slice(0, 7),
    window,
    mode,
    dryRun,
    evaluated: 0,
    skippedNoRoute: 0,
    passed: 0,
    failed: 0,
    cancelled: 0,
    billed: 0,
    removed: 0,
    errors: 0,
    failures: [] as Array<{ staffEmail: string; message: string }>,
    plan: [] as Array<{
      staffEmail: string;
      outcome: string;
      requiredDays: number;
      markedDays: number;
      missedDates: string[];
      billAction: string;
    }>,
  };

  const { data: assignments, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('id, staff_email, route_id')
    .eq('is_active', true);
  if (aErr) {
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }

  const { data: currentYear } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();

  // Booking and attendance dates are per-route, and many in-charges share a
  // route -- nine on one of them. Fetching per assignment would repeat the same
  // two queries nine times, so they are cached by route for the whole run.
  const bookedByRoute = new Map<string, string[]>();
  const markedByRoute = new Map<string, string[]>();

  async function routeDates(routeId: string) {
    if (!bookedByRoute.has(routeId)) {
      const { data, error } = await svc
        .from('tms_booking')
        .select('travel_date')
        .eq('route_id', routeId)
        .gte('travel_date', window.start)
        .lte('travel_date', window.end);
      // NEVER let a failed query read as "the bus never ran" -- that empties the
      // denominator and passes everyone, cancelling bills that should stand.
      if (error) throw new Error(`booking load failed: ${error.message}`);
      bookedByRoute.set(routeId, (data ?? []).map((r) => (r as { travel_date: string }).travel_date));

      const { data: att, error: attErr } = await svc
        .from('tms_attendance')
        .select('trip_date')
        .eq('route_id', routeId)
        .gte('trip_date', window.start)
        .lte('trip_date', window.end);
      // And never let THIS one read as "nobody marked" -- that fails everyone
      // and bills them for an infrastructure failure.
      if (attErr) throw new Error(`attendance load failed: ${attErr.message}`);
      markedByRoute.set(routeId, (att ?? []).map((r) => (r as { trip_date: string }).trip_date));
    }
    return {
      booked: bookedByRoute.get(routeId) ?? [],
      marked: markedByRoute.get(routeId) ?? [],
    };
  }

  for (const a of assignments ?? []) {
    try {
      summary.evaluated++;
      if (!a.route_id) {
        summary.skippedNoRoute++;
        continue;
      }

      // An ACTIVE probation narrows the window: the staffer committed from the
      // day they accepted, not from the 1st, and holding them to days that
      // preceded their promise would make the promise unwinnable.
      const { data: probation } = await svc
        .from('tms_incharge_probation')
        .select('id, window_start, window_end')
        .ilike('staff_email', emailIlikePattern(a.staff_email))
        .eq('status', 'active')
        .maybeSingle();
      const prob = probation as { id: string; window_start: string; window_end: string } | null;
      const from = prob?.window_start ?? window.start;
      const to = prob?.window_end ?? window.end;

      const { booked, marked } = await routeDates(a.route_id as string);
      const days = serviceDays(booked, from, to);
      const verdict = evaluateMonth({ serviceDays: days, markedDates: marked });

      const { data: profile } = await svc
        .from('profiles')
        .select('id')
        .ilike('email', emailIlikePattern(a.staff_email))
        .maybeSingle();
      const profileId = (profile as { id: string } | null)?.id ?? null;
      const staffId = await resolveStaffId(svc, { email: a.staff_email, profileId });

      let billAction: 'cancelled' | 'generated' | 'none' = 'none';

      if (verdict.outcome === 'passed') {
        summary.passed++;
        if (act && staffId && currentYear?.id) {
          const res = await cancelStaffBills(svc, {
            personId: staffId,
            transportYearId: currentYear.id as string,
          });
          if (res.cancelled > 0) {
            billAction = 'cancelled';
            summary.cancelled += res.cancelled;
          }
        } else if (staffId) {
          billAction = 'cancelled';
        }
      } else {
        summary.failed++;
        if (act && staffId && currentYear?.id) {
          // Held bills become payable; a staffer with no bill row yet has one
          // raised now. Both paths end in a payable bill, which is what the
          // lockout screen and the admin mark-paid action both expect.
          const promoted = await makeStaffBillsPayable(svc, {
            personId: staffId,
            transportYearId: currentYear.id as string,
          });
          if (promoted.generated === 0) {
            await generateStaffBill(svc, {
              staffId,
              transportYearId: currentYear.id as string,
            });
          }
          billAction = 'generated';
          summary.billed++;

          await svc.from('tms_staff_route_assignment')
            .update({ is_active: false }).eq('id', a.id);
          await maybeRevokeBoardingRole(svc, a.id);
          summary.removed++;
        } else {
          billAction = 'generated';
        }
      }

      if (prob && act) {
        await svc.from('tms_incharge_probation')
          .update({ status: verdict.outcome === 'passed' ? 'passed' : 'failed' })
          .eq('id', prob.id);
      }

      summary.plan.push({
        staffEmail: a.staff_email,
        outcome: verdict.outcome,
        requiredDays: verdict.requiredDays,
        markedDays: verdict.markedDays,
        missedDates: verdict.missedDates,
        billAction,
      });

      // Shadow mode still RECORDS the verdict -- that is the entire point of
      // shadow, it builds the admin board from real decisions. Only dryRun
      // writes nothing.
      if (!dryRun) {
        await svc.from('tms_incharge_month_verdict').upsert(
          {
            staff_email: a.staff_email.toLowerCase().trim(),
            person_id: staffId,
            route_id: a.route_id,
            month: `${anchor.slice(0, 7)}-01`,
            window_start: from,
            window_end: to,
            required_days: verdict.requiredDays,
            marked_days: verdict.markedDays,
            missed_dates: verdict.missedDates,
            outcome: verdict.outcome,
            bill_action: billAction,
            was_probation: Boolean(prob),
            mode,
            decided_at: new Date().toISOString(),
          },
          { onConflict: 'staff_email,month' },
        );
      }

      if (act && profileId) {
        await notifyProfile(svc, {
          profileId,
          actorId: profileId,
          title: verdict.outcome === 'passed'
            ? 'Transport fee cancelled'
            : 'Transport fee is now payable',
          body: verdict.outcome === 'passed'
            ? `Your bus was marked on every service day this month, so your transport fee bill has been cancelled. Thank you for keeping the attendance up to date.`
            : `Attendance was not marked on ${verdict.missedDates.join(', ')}. Your bus in-charge role has been removed and your transport fee is now payable. Once you pay the fees you can continue the transport service.`,
          url: '/boarding/in-charge',
        });
      }
    } catch (e) {
      // One staffer's failure must never abort the run for the others.
      summary.errors++;
      summary.failures.push({
        staffEmail: a.staff_email,
        message: e instanceof Error ? e.message : String(e),
      });
      console.error('[incharge-month-verdict] failed for', a.staff_email, e);
    }
  }

  return NextResponse.json({ success: true, data: summary });
}
