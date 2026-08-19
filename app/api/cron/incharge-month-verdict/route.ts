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
 *   - A third gate, below: `act` also requires the run to be evaluating the
 *     TRUE end of the month, or an explicit `month=` param. See the comment
 *     at `canAct`.
 *
 * Blast radius, measured 2026-08-18: under the zero-miss rule NO route was
 * marked on every day it carried riders, so a live run bills all 102 in-charges
 * about Rs 13 lakh. That consequence was chosen deliberately and is recorded in
 * the design doc -- but it is why the first live run must be a human pressing a
 * button, never this job waking up on its own.
 *
 * This route has no AuthContext -- it is a cron, not an admin action -- so it
 * deliberately does NOT call lib/activity/log.ts (which requires one). The
 * tms_incharge_month_verdict row this route writes IS the audit substitute:
 * every cancellation, bill and revoke this job performs must be explainable
 * from that table alone. This is a decision, not an oversight.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { istToday } from '@/lib/booking/window';
import { notifyProfile } from '@/lib/notifications/notify';
import { maybeRevokeBoardingRole } from '@/lib/boarding/roles';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { resolveStaffId } from '@/lib/identity/staff-lookup';
import { generateStaffBill, resolveStaffBillPlan } from '@/lib/fees/staff-bill';
import { cancelStaffBills, makeStaffBillsPayable } from '@/lib/fees/cancel-staff-bill';
import { loadStaffBillState } from '@/lib/fees/staff-bill-state';
import { serviceDays, evaluateMonth, monthWindow } from '@/lib/boarding/incharge-month';

export const dynamic = 'force-dynamic';

interface Assignment {
  id: string;
  staff_email: string;
  route_id: string | null;
}

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

  // The pg_cron schedule fires '0 16 28-31 * *' -- every day from the 28th
  // onward, because cron syntax cannot express "the last day of the month".
  // Recording the verdict in shadow on the 28th-30th is harmless (that is
  // the whole point of shadow). But ACTING three days early is not: it
  // settles the month before it has finished, on non-idempotent side
  // effects (money moved, a role revoked, a notification sent). Money and
  // roles may only move on the day that truly is the month's last day --
  // OR when a human explicitly named a month via `month=`, which is by
  // definition a deliberate, once-off run.
  const monthExplicit = monthParam !== null;
  const atMonthEnd = today === window.end;
  const canAct = atMonthEnd || monthExplicit;
  const act = mode === 'enforce' && !dryRun && canAct;
  const actionWithheldReason =
    mode === 'enforce' && !dryRun && !canAct
      ? `withheld: today (${today}) is not the last day of the verdict month (${window.end}); pass ?month=YYYY-MM to force a deliberate run`
      : null;

  if (mode === 'off') {
    return NextResponse.json({ success: true, data: { month: window, mode, skipped: 'mode_off' } });
  }

  const summary = {
    month: monthParam ?? anchor.slice(0, 7),
    window,
    mode,
    dryRun,
    actionWithheldReason,
    evaluated: 0,
    skippedNoRoute: 0,
    passed: 0,
    failed: 0,
    cancelled: 0,
    billed: 0,
    removed: 0,
    /** Reached a failing verdict but could not be acted on (unbillable / unresolved). */
    blocked: 0,
    errors: 0,
    failures: [] as Array<{ staffEmail: string; message: string }>,
    plan: [] as Array<{
      staffEmail: string;
      outcome: string;
      requiredDays: number;
      markedDays: number;
      missedDates: string[];
      billAction: string;
      blockedReason?: string;
    }>,
  };

  const { data: assignmentRows, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('id, staff_email, route_id')
    .eq('is_active', true);
  if (aErr) {
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }
  const assignments = (assignmentRows ?? []) as Assignment[];

  const { data: currentYear, error: cyErr } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  // NEVER let this read as "no current year, so evaluate nobody" -- a failed
  // query and a genuinely absent current year must not collapse into the
  // same silent no-op that a live run then mistakes for a quiet month.
  if (cyErr) {
    return NextResponse.json({ error: 'Failed to load current transport year' }, { status: 500 });
  }
  if (!currentYear?.id) {
    return NextResponse.json({
      success: true,
      data: { month: window, mode, skipped: 'no_current_year' },
    });
  }

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

  // Group assignments by PERSON, not by row. A staffer on two routes was
  // previously evaluated twice -- once per assignment row -- and could pass
  // on one route and fail on the other, with both verdicts fighting over the
  // same (staff_email, month) audit row and only ONE of their two
  // assignments getting deactivated on a fail (so maybeRevokeBoardingRole
  // found the surviving one and kept the role -- billed and still in-charge).
  // Evaluating the person once across the union of their routes closes that.
  const groups = new Map<string, { staffEmail: string; rows: Assignment[] }>();
  for (const a of assignments) {
    const key = a.staff_email.toLowerCase().trim();
    const existing = groups.get(key);
    if (existing) existing.rows.push(a);
    else groups.set(key, { staffEmail: a.staff_email, rows: [a] });
  }

  for (const group of groups.values()) {
    try {
      summary.evaluated++;

      const routeIds = [...new Set(
        group.rows.map((r) => r.route_id).filter((id): id is string => Boolean(id)),
      )];
      if (routeIds.length === 0) {
        summary.skippedNoRoute++;
        continue;
      }

      // An ACTIVE probation narrows the window: the staffer committed from the
      // day they accepted, not from the 1st, and holding them to days that
      // preceded their promise would make the promise unwinnable.
      //
      // Filtered to probations that overlap THIS verdict month -- matching
      // app/api/boarding/access/route.ts. Without this, a probation accepted
      // in an earlier month and never explicitly closed out would still be
      // 'active' and would silently narrow (or pass) a LATER month's verdict
      // for free.
      const { data: probation } = await svc
        .from('tms_incharge_probation')
        .select('id, window_start, window_end')
        .ilike('staff_email', emailIlikePattern(group.staffEmail))
        .eq('status', 'active')
        .gte('window_end', window.start)
        .lte('window_start', window.end)
        .maybeSingle();
      const prob = probation as { id: string; window_start: string; window_end: string } | null;
      const from = prob?.window_start ?? window.start;
      const to = prob?.window_end ?? window.end;

      // Union across the person's routes: each route contributes its own
      // service days (it may run on different days than a colleague route),
      // and a mark on ANY of the person's routes that day counts -- credit
      // is route-level (shared roster), and stays that way when a person
      // covers more than one route.
      const serviceDaySet = new Set<string>();
      const markedSet = new Set<string>();
      for (const routeId of routeIds) {
        const { booked, marked } = await routeDates(routeId);
        for (const d of serviceDays(booked, from, to)) serviceDaySet.add(d);
        for (const d of marked) markedSet.add(d);
      }
      const verdict = evaluateMonth({
        serviceDays: [...serviceDaySet].sort(),
        markedDates: [...markedSet],
      });

      const { data: profile } = await svc
        .from('profiles')
        .select('id')
        .ilike('email', emailIlikePattern(group.staffEmail))
        .maybeSingle();
      const profileId = (profile as { id: string } | null)?.id ?? null;
      const staffId = await resolveStaffId(svc, { email: group.staffEmail, profileId });

      let billAction: 'cancelled' | 'generated' | 'none' = 'none';
      let blockedReason: string | undefined;

      if (verdict.outcome === 'passed') {
        summary.passed++;
        if (act && staffId && currentYear.id) {
          const res = await cancelStaffBills(svc, {
            personId: staffId,
            transportYearId: currentYear.id as string,
            // Cancel only the bill(s) belonging to THIS verdict month, not the
            // staffer's whole year -- see the comment on cancelStaffBills for
            // why an unscoped cancel was a critical bug.
            dueFrom: window.start,
            dueTo: window.end,
          });
          if (res.cancelled > 0) {
            billAction = 'cancelled';
            summary.cancelled += res.cancelled;
          }
        } else if (staffId && currentYear.id) {
          // shadow / dryRun preview: mirror the exact gate the real path
          // requires -- confirm a bill actually exists before previewing a
          // cancellation. Only 38 of ~108 in-charges have a bill at all,
          // so promising 'cancelled' unconditionally (as this branch used
          // to) overstated what an 'enforce' run would do on the evidence an
          // admin reads before flipping the mode.
          const state = await loadStaffBillState(svc, {
            personId: staffId,
            transportYearId: currentYear.id as string,
          });
          billAction = state.hasOutstanding ? 'cancelled' : 'none';
        }
      } else {
        summary.failed++;
        if (!staffId || !currentYear.id) {
          // Can't bill someone we can't resolve, so no role is taken away --
          // same "no bill, no role loss" guarantee as the blocked path below.
          blockedReason = !staffId ? 'unresolved staff id' : 'no current transport year';
          summary.blocked++;
          summary.failures.push({
            staffEmail: group.staffEmail,
            message: `blocked: ${blockedReason}`,
          });
        } else if (act) {
          // Held bills become payable; a staffer with no bill row yet has one
          // raised now. The revoke below must never run until one of these
          // two paths has confirmed a payable bill actually exists -- the
          // daily cron (incharge-attendance) makes the identical guarantee:
          // "No bill can be raised, so no role is taken away."
          const promoted = await makeStaffBillsPayable(svc, {
            personId: staffId,
            transportYearId: currentYear.id as string,
          });
          let billed = promoted.generated > 0;

          if (!billed) {
            const gen = await generateStaffBill(svc, {
              staffId,
              transportYearId: currentYear.id as string,
            });
            if (gen.billingStatus === 'billed') {
              // generateStaffBill defaults new rows to 'staff_deferred' --
              // promote them so the admin mark-paid path (which requires
              // 'generated') can actually collect this.
              await makeStaffBillsPayable(svc, {
                personId: staffId,
                transportYearId: currentYear.id as string,
              });
              billed = true;
            } else {
              blockedReason = gen.billingStatus;
              summary.blocked++;
              summary.failures.push({
                staffEmail: group.staffEmail,
                message: `blocked: ${gen.billingStatus}`,
              });
            }
          }

          // generateStaffBill can report billingStatus:'billed' even when
          // EVERY term insert 23505'd -- the idempotency index
          // (fee_structure_id, person_id, term_no, transport_year_id) does
          // NOT include status, so a row this same staffer already has in
          // 'cancelled' state (from an earlier passed month) silently blocks
          // re-billing that term and 'billed' is returned with inserted: 0.
          // Never trust the reported status alone -- re-read the actual bill
          // state and require a REAL outstanding bill before the role is
          // taken away.
          if (billed) {
            const after = await loadStaffBillState(svc, {
              personId: staffId,
              transportYearId: currentYear.id as string,
            });
            if (!after.hasOutstanding) {
              billed = false;
              blockedReason = 'bill could not be made payable (existing cancelled bill blocks re-billing for this term)';
              summary.blocked++;
              summary.failures.push({
                staffEmail: group.staffEmail,
                message: `blocked: ${blockedReason}`,
              });
            }
          }

          if (billed) {
            billAction = 'generated';
            summary.billed++;

            const assignmentIds = group.rows.map((r) => r.id);
            await svc.from('tms_staff_route_assignment')
              .update({ is_active: false }).in('id', assignmentIds);
            // All of the person's active assignments are gone now (not just
            // the one that happened to be evaluated last), so a single call
            // is enough -- maybeRevokeBoardingRole resolves the email from
            // whichever assignment id it is given and checks for ANY
            // remaining active row for that person.
            await maybeRevokeBoardingRole(svc, assignmentIds[0]);
            summary.removed++;

            // The daily loop (incharge-attendance) carries removed_at /
            // billing_status forward with a comment claiming the month-end
            // verdict writes them -- make that true. Update only, never
            // insert: if a strike row does not exist for an assignment this
            // route never creates one, it just skips quietly (an update
            // that matches zero rows is not an error).
            const revokedAt = new Date().toISOString();
            for (const assignmentId of assignmentIds) {
              await svc.from('tms_incharge_attendance_strike')
                .update({ removed_at: revokedAt, billing_status: 'billed' })
                .eq('assignment_id', assignmentId);
            }
          }
        } else {
          // shadow / dryRun preview: PROBE billability without writing, so a
          // staffer who would be blocked shows as blocked here too, never as
          // billed -- this is the ₹13-lakh preview an admin reads before
          // flipping the mode to 'enforce', and it must not promise an
          // action that would not happen.
          //
          // An already-outstanding bill (staff_deferred or generated) would
          // simply be confirmed/promoted for real, so that alone previews as
          // billable. Otherwise a fresh bill would need to be raised, and a
          // pre-existing CANCELLED row for this person/year is the exact
          // condition that silently defeats that insert (see the comment on
          // the real path above) -- so its presence previews as blocked even
          // when the fee structure itself resolves.
          const existing = await loadStaffBillState(svc, {
            personId: staffId,
            transportYearId: currentYear.id as string,
          });
          if (existing.hasOutstanding) {
            billAction = 'generated';
          } else {
            const [{ data: cancelledRows }, plan] = await Promise.all([
              svc
                .from('tms_fee_bill')
                .select('id')
                .eq('person_id', staffId)
                .eq('person_type', 'staff')
                .eq('transport_year_id', currentYear.id as string)
                .eq('status', 'cancelled')
                .limit(1),
              resolveStaffBillPlan(svc, {
                staffId,
                transportYearId: currentYear.id as string,
              }),
            ]);
            const blockedByCancelledBill = (cancelledRows?.length ?? 0) > 0;

            if (plan.billable && !blockedByCancelledBill) {
              billAction = 'generated';
            } else {
              blockedReason = !plan.billable
                ? plan.reason
                : 'bill could not be made payable (existing cancelled bill blocks re-billing for this term)';
              summary.blocked++;
              summary.failures.push({
                staffEmail: group.staffEmail,
                message: `blocked: ${blockedReason}`,
              });
            }
          }
        }
      }

      if (prob && act) {
        await svc.from('tms_incharge_probation')
          .update({ status: verdict.outcome === 'passed' ? 'passed' : 'failed' })
          .eq('id', prob.id);
      }

      summary.plan.push({
        staffEmail: group.staffEmail,
        outcome: verdict.outcome,
        requiredDays: verdict.requiredDays,
        markedDays: verdict.markedDays,
        missedDates: verdict.missedDates,
        billAction,
        ...(blockedReason ? { blockedReason } : {}),
      });

      // Shadow mode still RECORDS the verdict -- that is the entire point of
      // shadow, it builds the admin board from real decisions. Only dryRun
      // writes nothing.
      if (!dryRun) {
        const monthKey = `${anchor.slice(0, 7)}-01`;
        const staffEmailKey = group.staffEmail.toLowerCase().trim();

        // A re-run in the same month (e.g. a second `enforce` pass, or a
        // shadow pass after an earlier enforce run) must never DOWNGRADE an
        // already-recorded action: once bills are cancelled, cancelStaffBills
        // has nothing left to cancel and reports 0, which would otherwise
        // overwrite 'cancelled' with 'none' -- and on the fail side
        // 'generated' would become 'none', which hides the Mark-bill-paid
        // button the admin board keys off of.
        let recordedBillAction = billAction;
        if (billAction === 'none') {
          const { data: existingVerdict } = await svc
            .from('tms_incharge_month_verdict')
            .select('bill_action')
            .eq('staff_email', staffEmailKey)
            .eq('month', monthKey)
            .maybeSingle();
          const prior = (existingVerdict as { bill_action: string | null } | null)?.bill_action;
          if (prior && prior !== 'none') {
            recordedBillAction = prior as typeof billAction;
          }
        }

        await svc.from('tms_incharge_month_verdict').upsert(
          {
            staff_email: staffEmailKey,
            person_id: staffId,
            // The column is singular; a person spanning routes is stored
            // against their first (in iteration order) route as a
            // representative value -- the audit trail's authority for which
            // routes a person actually covered is tms_staff_route_assignment,
            // not this column.
            route_id: routeIds[0],
            month: monthKey,
            window_start: from,
            window_end: to,
            required_days: verdict.requiredDays,
            marked_days: verdict.markedDays,
            missed_dates: verdict.missedDates,
            outcome: verdict.outcome,
            bill_action: recordedBillAction,
            was_probation: Boolean(prob),
            mode,
            decided_at: new Date().toISOString(),
          },
          { onConflict: 'staff_email,month' },
        );
      }

      // billAction is the single source of truth for "something actually
      // changed" -- 'none' covers both the blocked failure path and a
      // passed staffer for whom nothing needed cancelling, and neither
      // deserves a notification claiming otherwise.
      if (act && profileId && billAction !== 'none') {
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
      // One person's failure must never abort the run for the others.
      summary.errors++;
      summary.failures.push({
        staffEmail: group.staffEmail,
        message: e instanceof Error ? e.message : String(e),
      });
      console.error('[incharge-month-verdict] failed for', group.staffEmail, e);
    }
  }

  return NextResponse.json({ success: true, data: summary });
}
