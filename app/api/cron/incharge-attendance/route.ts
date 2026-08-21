/**
 * Daily bus in-charge attendance enforcement loop.
 *
 * Scheduled from pg_cron via pg_net at "30 15 * * *" UTC = 21:00 IST, after
 * both the onward and return legs have closed, carrying
 * `Authorization: Bearer $CRON_SECRET`. (Vercel crons have never fired on this
 * project; see the migration for why pg_cron owns the schedule.)
 *
 * For each ACTIVE in-charge assignment: if the route had booked riders on a
 * weekday and nobody marked attendance, record a strike and warn. This job
 * is WARNINGS ONLY — it never removes an assignment and never raises a
 * bill. The month-end verdict (lib/boarding/incharge-month.ts) is the sole
 * authority over money and roles; letting this daily loop also punish would
 * mean the same missed days get charged twice. Reaching the threshold here
 * only escalates the warning copy and is counted in `atThreshold`.
 *
 * `inchargeEnforcementMode` (admin_settings) still gates whether strikes are
 * persisted and whether anyone is notified — 'shadow' evaluates and persists
 * but notifies nobody.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { istToday } from '@/lib/booking/window';
import { loadBookedRoster } from '@/lib/booking/roster';
import { notifyProfile } from '@/lib/notifications/notify';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { loadShareLearnerIds } from '@/lib/boarding/allocation-repo';
import {
  shareDuty,
  shareCovered,
  isExcused,
  delegatedTo,
  type AbsenceRow,
} from '@/lib/boarding/share-coverage';
import {
  evaluateDay,
  isServiceWeekday,
  warningCopy,
  REMOVAL_THRESHOLD,
  type StrikeState,
} from '@/lib/boarding/incharge-attendance';

/** Split an id list into <=150-id chunks (API-gateway limit on `.in()`). */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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

  // Backfill: evaluate a specific PAST day instead of today, so a streak can be
  // reconstructed from days that have already gone by. Replay is safe because
  // evaluateDay only lets the evaluated date move forward (see its <= guard).
  //
  // This route never revokes an assignment or raises a bill any more — see
  // the file header; that moved to the month-end verdict
  // (app/api/cron/incharge-month-verdict/route.ts). So `silent=1` and
  // `quiet=1` are now FUNCTIONALLY IDENTICAL here: both simply suppress the
  // notification while the strike still records and advances the same way
  // either way. Do not read either flag as controlling a bill or a removal
  // in this route — neither can happen here regardless of which is set.
  // They stay as two separate flags/names for backward compatibility with
  // existing callers (and any future scripts replaying past dates), not
  // because they still differ in effect.
  //
  // `silent=1` — used to prime a backfilled streak without warning people
  // about days they can no longer do anything about.
  //
  // `quiet=1` — exists for a retroactive catch-up, where replaying three past
  // days in one minute would otherwise fire three messages about days the
  // staffer cannot change.
  const dateParam = request.nextUrl.searchParams.get('date');
  const silent = request.nextUrl.searchParams.get('silent') === '1';
  const quiet = request.nextUrl.searchParams.get('quiet') === '1';

  const svc = createServiceRoleClient();
  const today = istToday();

  if (dateParam !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    // A future date has no attendance yet, so it would strike everyone for a
    // day that has not happened. Never allow it.
    if (dateParam > today) {
      return NextResponse.json({ error: 'date cannot be in the future' }, { status: 400 });
    }
  }
  const date = dateParam ?? today;

  const cfg = await loadSchedulingConfig(svc);
  const mode = cfg.inchargeEnforcementMode;
  // This route has nothing punitive left to gate — no revoke, no bill. `act`
  // now only feeds `notify` below: in effect it decides whether a warning is
  // sent. `shadow` still evaluates and persists strikes regardless of `act`
  // — that is the whole point, it builds the admin board out of real data —
  // `act` only withholds notification. `dryRun` persists nothing either way.
  const act = mode === 'enforce' && !dryRun && !silent;
  // Notifying is a STRICTLY narrower permission than acting: you can act
  // without telling anyone (`quiet`), but you can never tell someone their role
  // was removed when it was not. Deriving it from `act` makes that impossible
  // to get wrong — a message can only follow a change that really happened.
  const notify = act && !quiet;

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
    backfill: dateParam !== null,
    silent,
    quiet,
    evaluated: 0,
    skipped: 0,
    warned: 0,
    /** Assignments scored via the per-share rule (inchargeShareScoringEnabled). */
    shareScored: 0,
    /** Reached REMOVAL_THRESHOLD misses. The month-end verdict decides what happens next. */
    atThreshold: 0,
    errors: 0,
    // Which staffer failed and why. A bare error COUNT is undiagnosable —
    // always carry the reason out, even though this job now only warns
    // (revoking roles and writing bills is the month-end verdict's job).
    failures: [] as Array<{ staffEmail: string; message: string }>,
    dryRun,
    plan: [] as Array<{
      staffEmail: string;
      action: string;
      consecutiveMisses: number;
      missedDates: string[];
      dutyRequired: number;
      dutyMarked: number;
    }>,
  };

  const { data: assignments, error: aErr } = await svc
    .from('tms_staff_route_assignment')
    .select('id, staff_email, route_id, assigned_at, assigned_by')
    .eq('is_active', true);
  if (aErr) {
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }

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
      // This is the ORIGINAL rule and stays in force until the share flag is
      // on — one mark by one person credits every in-charge on the route.
      let attendanceMarked = false;
      let dutyRequired = 0;
      let dutyMarked = 0;

      if (a.route_id && cfg.inchargeShareScoringEnabled) {
        // Per-share coverage. A declared absence excuses the day outright.
        const { data: absData, error: absErr } = await svc
          .from('tms_incharge_absence')
          .select('assignment_id, absence_date, covering_assignment_id, cover_status')
          .eq('route_id', a.route_id)
          .eq('absence_date', date);
        if (absErr) throw new Error(`absence load failed: ${absErr.message}`);
        const absences = (absData ?? []) as AbsenceRow[];

        if (isExcused(a.id, date, absences)) {
          summary.skipped++;
          continue;
        }

        // My share, plus any share I accepted cover for today.
        const shareIds = new Set(await loadShareLearnerIds(svc, a.id));
        for (const covered of delegatedTo(a.id, date, absences)) {
          for (const id of await loadShareLearnerIds(svc, covered)) shareIds.add(id);
        }

        const duty = shareDuty({
          shareLearnerIds: [...shareIds],
          bookedLearnerIds: roster.riders.map((r) => r.learner_id),
        });

        // Only fetch marks when there is a duty to check. Chunked — an .in()
        // over the raw duty list would silently truncate at the API-gateway
        // limit, and a truncated duty list reads as "those learners were
        // never due", which turns a query limit into a free pass from being
        // billed. The largest measured share is 67 (route 24), but the guard
        // must exist: a route losing its in-charges collapses every student
        // onto one share.
        let markedIds: string[] = [];
        if (duty.length > 0) {
          for (const c of chunk(duty)) {
            const { data: att, error: attErr } = await svc
              .from('tms_attendance')
              .select('learner_id')
              .eq('route_id', a.route_id)
              .eq('trip_date', date)
              .in('learner_id', c);
            // NEVER let a failed query read as "nobody marked" — that
            // strikes, and eventually BILLS, a staffer for an infrastructure
            // failure.
            if (attErr) throw new Error(`attendance load failed: ${attErr.message}`);
            markedIds.push(...((att ?? []) as { learner_id: string }[]).map((r) => r.learner_id));
          }
        }

        const coverage = shareCovered({ duty, markedLearnerIds: markedIds });
        dutyRequired = coverage.required;
        dutyMarked = coverage.marked;
        // An EMPTY duty must not read as a miss. shareCovered already returns
        // covered:true for it, and evaluateDay's hasBookedRiders check is the
        // second guard.
        attendanceMarked = coverage.covered;
        summary.shareScored += 1;
      } else if (a.route_id) {
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
            dutyRequired,
            dutyMarked,
          });
        }
        continue;
      }

      // Resolve the staffer's profile once — needed for notifications.
      const { data: profile, error: profErr } = await svc
        .from('profiles')
        .select('id')
        .ilike('email', emailIlikePattern(a.staff_email))
        .maybeSingle();
      if (profErr) throw new Error(`profile load failed: ${profErr.message}`);
      const profileId = profile?.id ?? null;
      const actorId = a.assigned_by ?? profileId ?? null;
      const reachable = Boolean(profileId && actorId);

      if (outcome.action === 'remove') {
        // The daily loop no longer removes or bills. The month-end verdict is
        // the sole authority over money and roles, so a staffer cannot be
        // punished twice for the same missed days. The strike still advances
        // and still escalates the warning copy, which is what actually changes
        // behaviour during the month.
        summary.atThreshold = (summary.atThreshold ?? 0) + 1;
      }

      if (dryRun) {
        summary.plan.push({
          staffEmail: a.staff_email,
          action: outcome.action,
          consecutiveMisses: outcome.state.consecutiveMisses,
          missedDates: outcome.state.missedDates,
          dutyRequired,
          dutyMarked,
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
            // The daily job no longer removes or bills, so it never sets these —
            // carry forward whatever the month-end verdict (or a historical
            // run) already wrote, so existing rows keep their data.
            removed_at: strike?.removed_at ?? null,
            billing_status: strike?.billing_status ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'assignment_id' },
        );
      }

      if (outcome.action === 'warn') {
        // Counted whether or not delivery succeeds — the strike DID advance.
        summary.warned++;
        if (!notify) {
          // shadow / dryRun / quiet: the strike is recorded, but nobody is told.
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
      } else if (outcome.action === 'remove' && notify && reachable && profileId && actorId) {
        await notifyProfile(svc, {
          profileId,
          actorId,
          title: 'Attendance still not marked',
          body:
            `Your bus was not marked on ${outcome.state.missedDates.join(', ')}. ` +
            `At the end of this month, any service day left unmarked will make your ` +
            `transport fee payable and remove your bus in-charge role.`,
          url: '/boarding/attendance',
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
