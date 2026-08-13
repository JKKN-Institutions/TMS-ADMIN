/**
 * Daily bus in-charge attendance enforcement loop.
 *
 * Scheduled from pg_cron via pg_net at "30 15 * * *" UTC = 21:00 IST, after
 * both the onward and return legs have closed, carrying
 * `Authorization: Bearer $CRON_SECRET`. (Vercel crons have never fired on this
 * project; see the migration for why pg_cron owns the schedule.)
 *
 * For each ACTIVE in-charge assignment: if the route had booked riders on a
 * weekday and nobody marked attendance, record a strike. The first two
 * consecutive strikes warn; the third revokes the assignment and generates a
 * staff fee bill.
 *
 * Two gates stand in front of any punitive action:
 *   - `inchargeEnforcementMode` (admin_settings). Ships as 'shadow', which
 *     evaluates and PERSISTS strikes but notifies, removes and bills nobody.
 *   - billability. If no staff fee structure with terms applies to the
 *     staffer, the removal is blocked rather than performed: nobody loses
 *     their fee exemption without the bill that justifies it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { istToday } from '@/lib/booking/window';
import { loadBookedRoster } from '@/lib/booking/roster';
import { notifyProfile } from '@/lib/notifications/notify';
import { maybeRevokeBoardingRole } from '@/lib/boarding/roles';
import { logActivityFromHeaders } from '@/lib/activity/log';
import { generateStaffBill, resolveStaffBillPlan } from '@/lib/fees/staff-bill';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import {
  evaluateDay,
  isServiceWeekday,
  warningCopy,
  removalCopy,
  performRemoval,
  REMOVAL_THRESHOLD,
  type StrikeState,
  type BillingStatus,
} from '@/lib/boarding/incharge-attendance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Dry run: compute and report every outcome, but write nothing and notify
  // nobody. Mirrors the fees generate route's dry_run convention. Auth is
  // still required — this is not a public preview.
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  const svc = createServiceRoleClient();
  const date = istToday();

  const cfg = await loadSchedulingConfig(svc);
  const mode = cfg.inchargeEnforcementMode;
  // `act` is the single authority on whether anything punitive happens.
  // `shadow` still evaluates and persists strikes — that is the whole point,
  // it builds the admin board out of real data — it only withholds
  // notifications, revokes and bills. `dryRun` persists nothing either way.
  const act = mode === 'enforce' && !dryRun;

  if (mode === 'off') {
    return NextResponse.json({ success: true, data: { date, mode, skipped: 'mode_off' } });
  }
  // Weekends are not service days, so the whole run short-circuits before a
  // single per-assignment query is issued.
  if (!isServiceWeekday(date)) {
    return NextResponse.json({ success: true, data: { date, mode, skipped: 'not_a_service_day' } });
  }

  const summary = {
    date,
    mode,
    evaluated: 0,
    skipped: 0,
    warned: 0,
    removed: 0,
    /** Reached the threshold but could not be acted on (unbillable / unreachable). */
    blocked: 0,
    billed: 0,
    errors: 0,
    // Which staffer failed and why. A bare error COUNT is undiagnosable in a
    // job that revokes roles and writes bills — always carry the reason out.
    failures: [] as Array<{ staffEmail: string; message: string }>,
    dryRun,
    plan: [] as Array<{
      staffEmail: string;
      action: string;
      consecutiveMisses: number;
      missedDates: string[];
      wouldBill: boolean;
      blockedReason?: string;
    }>,
  };

  const { data: assignments, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('id, staff_email, route_id, assigned_at, assigned_by')
    .eq('is_active', true);
  if (aErr) {
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }

  const { data: currentYear } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();

  for (const a of assignments ?? []) {
    try {
      summary.evaluated++;

      const { data: strike, error: strikeErr } = await svc
        .from('tms_incharge_attendance_strike')
        .select('*')
        .eq('assignment_id', a.id)
        .maybeSingle();
      // A failed load would silently reset the streak AND drop
      // last_evaluated_date (losing same-day idempotency). Fail this staffer
      // instead — the catch records it and no strike is written.
      if (strikeErr) throw new Error(`strike load failed: ${strikeErr.message}`);

      const prev: StrikeState = {
        consecutiveMisses: strike?.consecutive_misses ?? 0,
        missedDates: (strike?.missed_dates as string[] | null) ?? [],
        lastEvaluatedDate: strike?.last_evaluated_date ?? null,
      };

      const roster = a.route_id
        ? await loadBookedRoster(svc, a.route_id, date)
        : { counts: { booked: 0, capacity: 0 }, riders: [] };

      // Route-level coverage: ANY mark on this route today, either leg, counts.
      let attendanceMarked = false;
      if (a.route_id) {
        const { count, error: attErr } = await svc
          .from('tms_attendance')
          .select('id', { count: 'exact', head: true })
          .eq('route_id', a.route_id)
          .eq('trip_date', date);
        // NEVER let a failed query read as "nobody marked attendance" — that
        // would strike, and eventually BILL, a staffer for an infrastructure
        // failure. Fail loudly instead.
        if (attErr) throw new Error(`attendance count failed: ${attErr.message}`);
        attendanceMarked = (count ?? 0) > 0;
      }

      const outcome = evaluateDay(prev, {
        date,
        hasBookedRiders: roster.riders.length > 0,
        attendanceMarked,
        assignedOnDate: a.assigned_at ? istToday(new Date(a.assigned_at)) === date : false,
        // The whole run already short-circuited on non-service days.
        isServiceWeekday: true,
      });

      if (outcome.action === 'skip') {
        summary.skipped++;
        if (dryRun) {
          summary.plan.push({
            staffEmail: a.staff_email,
            action: `skip:${outcome.reason}`,
            consecutiveMisses: prev.consecutiveMisses,
            missedDates: prev.missedDates,
            wouldBill: false,
          });
        }
        continue;
      }

      // Resolve the staffer's profile once — needed for notifications.
      const { data: profile, error: profErr } = await svc
        .from('profiles')
        .select('id')
        .ilike('email', a.staff_email)
        .maybeSingle();
      if (profErr) throw new Error(`profile load failed: ${profErr.message}`);
      const profileId = profile?.id ?? null;
      const actorId = a.assigned_by ?? profileId ?? null;
      const reachable = Boolean(profileId && actorId);

      let billingStatus: BillingStatus | null = null;
      let blockedReason: string | null = null;

      if (outcome.action === 'remove') {
        // Resolve the staff row and PROBE billability before touching the role.
        const { data: staffRow } = await svc
          .from('staff')
          .select('id')
          .ilike('email', a.staff_email)
          .maybeSingle();

        const plan =
          staffRow?.id && currentYear?.id
            ? await resolveStaffBillPlan(svc, {
                staffId: staffRow.id as string,
                transportYearId: currentYear.id as string,
              })
            : ({ billable: false, reason: 'no_structure' } as const);

        if (!reachable) {
          // Never revoke a role or bill a person we cannot even notify. The
          // strike still persists below, so this resurfaces on every run until
          // a human fixes the missing profiles row.
          blockedReason = 'no reachable profiles row';
          summary.errors++;
          summary.failures.push({
            staffEmail: a.staff_email,
            message: 'no reachable profiles row — removal and billing skipped',
          });
        } else if (!plan.billable) {
          // No bill can be raised, so no role is taken away. Nobody loses their
          // fee exemption without the bill that justifies it; the transport
          // office sees this on the admin board and configures the fee terms.
          blockedReason =
            plan.reason === 'error' ? 'billing lookup failed' : 'no staff fee structure with terms';
          billingStatus = plan.reason;
          summary.blocked++;
        } else if (!act) {
          // shadow or dryRun: count what WOULD happen, change nothing.
          summary.removed++;
        } else {
          // performRemoval guarantees revoke-then-bill, and that a billing
          // failure cannot undo the revoke. See lib/boarding/incharge-attendance.ts.
          const removal = await performRemoval({
            revoke: async () => {
              await svc
                .from('tms_staff_route_assignment')
                .update({ is_active: false })
                .eq('id', a.id);
              await maybeRevokeBoardingRole(svc, a.id);
            },
            bill: async () => {
              const res = await generateStaffBill(svc, {
                staffId: staffRow!.id as string,
                transportYearId: currentYear!.id as string,
              });
              return res.billingStatus;
            },
          });

          billingStatus = removal.billingStatus;
          if (billingStatus === 'billed') summary.billed++;
          summary.removed++;
          await logActivityFromHeaders(request, {
            module: 'staff-route-assignments',
            action: 'unassign',
            entityId: a.id,
            metadata: {
              reason: 'attendance_auto_removal',
              missed_dates: outcome.state.missedDates,
              billing_status: billingStatus,
            },
          });
        }
      }

      if (dryRun) {
        summary.plan.push({
          staffEmail: a.staff_email,
          action: outcome.action,
          consecutiveMisses: outcome.state.consecutiveMisses,
          missedDates: outcome.state.missedDates,
          wouldBill: outcome.action === 'remove' && !blockedReason,
          ...(blockedReason ? { blockedReason } : {}),
        });
      }

      // Persist the strike state (upsert on the unique assignment_id).
      // This RUNS in shadow mode — recording what would have happened is the
      // entire purpose of shadow. Only dryRun writes nothing.
      if (!dryRun) {
        await svc.from('tms_incharge_attendance_strike').upsert(
          {
            assignment_id: a.id,
            staff_email: a.staff_email,
            route_id: a.route_id,
            consecutive_misses: outcome.state.consecutiveMisses,
            missed_dates: outcome.state.missedDates,
            last_evaluated_date: outcome.state.lastEvaluatedDate,
            warned_at:
              outcome.action === 'warn'
                ? new Date().toISOString()
                : outcome.action === 'reset'
                  ? null
                  : strike?.warned_at ?? null,
            // Only a removal that ACTUALLY happened is recorded as one. A
            // blocked or shadowed removal leaves this null, which is what
            // makes the admin board's "pending removal" status derivable.
            removed_at:
              outcome.action === 'remove' && act && !blockedReason
                ? new Date().toISOString()
                : strike?.removed_at ?? null,
            billing_status: billingStatus ?? strike?.billing_status ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'assignment_id' },
        );
      }

      if (outcome.action === 'warn') {
        // Counted whether or not delivery succeeds — the strike DID advance.
        summary.warned++;
        if (!act) {
          // shadow / dryRun: the strike is recorded, but nobody is told.
        } else if (reachable && profileId && actorId) {
          // The last warning before the threshold escalates its copy.
          const isFinal = outcome.state.consecutiveMisses >= REMOVAL_THRESHOLD - 1;
          const copy = warningCopy(outcome.state.missedDates, isFinal);
          await notifyProfile(svc, {
            profileId,
            actorId,
            title: copy.title,
            body: copy.body,
            url: '/boarding/attendance',
          });
        } else {
          summary.failures.push({
            staffEmail: a.staff_email,
            message: 'warning not delivered — no reachable profiles row',
          });
        }
      } else if (
        outcome.action === 'remove' &&
        act &&
        !blockedReason &&
        reachable &&
        profileId &&
        actorId &&
        billingStatus !== null
      ) {
        const copy = removalCopy(outcome.state.missedDates, billingStatus === 'billed');
        await notifyProfile(svc, {
          profileId,
          actorId,
          title: copy.title,
          body: copy.body,
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
      console.error('[incharge-attendance] failed for', a.staff_email, e);
    }
  }

  return NextResponse.json({ success: true, data: summary });
}
