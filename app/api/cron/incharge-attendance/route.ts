/**
 * Daily bus in-charge attendance enforcement loop.
 *
 * Scheduled from vercel.json at "30 15 * * *" UTC = 21:00 IST, after both the
 * onward and return legs have closed. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 *
 * For each ACTIVE in-charge assignment: if the route had booked riders that day
 * and nobody marked attendance, record a strike. First strike warns; the second
 * CONSECUTIVE strike revokes the assignment and generates a staff fee bill.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { istToday } from '@/lib/booking/window';
import { loadBookedRoster } from '@/lib/booking/roster';
import { notifyProfile } from '@/lib/notifications/notify';
import { maybeRevokeBoardingRole } from '@/lib/boarding/roles';
import { logActivityFromHeaders } from '@/lib/activity/log';
import { generateStaffBill } from '@/lib/fees/staff-bill';
import {
  evaluateDay,
  warningCopy,
  removalCopy,
  performRemoval,
  type StrikeState,
  type BillingStatus,
} from '@/lib/boarding/incharge-attendance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createServiceRoleClient();
  const date = istToday();
  const summary = {
    date,
    evaluated: 0,
    skipped: 0,
    warned: 0,
    removed: 0,
    billed: 0,
    errors: 0,
    // Which staffer failed and why. A bare error COUNT is undiagnosable in a
    // job that revokes roles and writes bills — always carry the reason out.
    failures: [] as Array<{ staffEmail: string; message: string }>,
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

      const { data: strike } = await svc
        .from('tms_incharge_attendance_strike')
        .select('*')
        .eq('assignment_id', a.id)
        .maybeSingle();

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
        const { count } = await svc
          .from('tms_attendance')
          .select('id', { count: 'exact', head: true })
          .eq('route_id', a.route_id)
          .eq('trip_date', date);
        attendanceMarked = (count ?? 0) > 0;
      }

      const outcome = evaluateDay(prev, {
        date,
        hasBookedRiders: roster.riders.length > 0,
        attendanceMarked,
        assignedOnDate: (a.assigned_at ?? '').slice(0, 10) === date,
      });

      if (outcome.action === 'skip') {
        summary.skipped++;
        continue;
      }

      // Resolve the staffer's profile once — needed for notifications.
      const { data: profile } = await svc
        .from('profiles')
        .select('id')
        .ilike('email', a.staff_email)
        .maybeSingle();
      const actorId = a.assigned_by ?? profile?.id ?? null;

      let billingStatus: BillingStatus | null = null;

      if (outcome.action === 'remove') {
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
            const { data: staffRow } = await svc
              .from('staff')
              .select('id')
              .ilike('email', a.staff_email)
              .maybeSingle();
            if (!staffRow?.id || !currentYear?.id) return 'no_structure';
            const res = await generateStaffBill(svc, {
              staffId: staffRow.id,
              transportYearId: currentYear.id,
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

      // Persist the strike state (upsert on the unique assignment_id).
      await svc.from('tms_incharge_attendance_strike').upsert(
        {
          assignment_id: a.id,
          staff_email: a.staff_email,
          route_id: a.route_id,
          consecutive_misses: outcome.state.consecutiveMisses,
          missed_dates: outcome.state.missedDates,
          last_evaluated_date: outcome.state.lastEvaluatedDate,
          warned_at: outcome.action === 'warn' ? new Date().toISOString() : strike?.warned_at ?? null,
          removed_at: outcome.action === 'remove' ? new Date().toISOString() : strike?.removed_at ?? null,
          billing_status: billingStatus ?? strike?.billing_status ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'assignment_id' },
      );

      if (profile?.id && actorId) {
        if (outcome.action === 'warn') {
          const copy = warningCopy(outcome.state.missedDates);
          await notifyProfile(svc, {
            profileId: profile.id,
            actorId,
            title: copy.title,
            body: copy.body,
            url: '/boarding/attendance',
          });
          summary.warned++;
        } else if (outcome.action === 'remove') {
          const copy = removalCopy(outcome.state.missedDates, billingStatus === 'billed');
          await notifyProfile(svc, {
            profileId: profile.id,
            actorId,
            title: copy.title,
            body: copy.body,
            url: '/boarding/in-charge',
          });
        }
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
