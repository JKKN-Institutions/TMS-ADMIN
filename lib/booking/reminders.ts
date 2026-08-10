import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, bookableDates, cutoffFor, istToday } from './window';
import { loadExceptions } from './calendar';
import { loadSchedulingConfig } from '../settings/scheduling';
import { term1PaidLearnerIds } from '../fees/term1';
import { dispatchNotification } from '../notifications/dispatch';
import { reminderCopy } from './reminder-copy';
import { reminderTargets, type LearnerRow } from './reminder-targets';

// Re-exported so callers have one import site for the reminder API; the pure
// implementations live in ./reminder-copy and ./reminder-targets (see those
// files for why they are kept import-free).
export { formatCutoffHour, reminderCopy } from './reminder-copy';
export { reminderTargets, type LearnerRow } from './reminder-targets';

export interface ReminderSummary {
  /** The travel date reminded for — null when no working day is open. */
  date: string | null;
  reminded: number;
  candidates: number;
  /** Non-null when the run intentionally did nothing (e.g. reminders disabled). */
  skipped: string | null;
  dryRun: boolean;
}

/**
 * Notify every transport learner who has NOT booked tomorrow yet.
 *
 * Targeting is deliberately narrow: bus_required learners with a route AND a login
 * profile, minus anyone who already booked that date, minus anyone already reminded
 * for it. Idempotent per (learner, date) via the url marker, so a retried cron run
 * cannot double-notify.
 */
export async function sendBookingReminders(
  svc: SupabaseClient,
  opts: { createdBy?: string | null; dryRun?: boolean } = {},
): Promise<ReminderSummary> {
  const dryRun = opts.dryRun === true;
  const cfg = await loadSchedulingConfig(svc);

  // The reminder run is route-agnostic (one date for the whole cohort), so it
  // reads ALL-ROUTES exceptions only. A holiday declared for a single route does
  // not shift the date; those learners still get the nudge and are blocked at
  // booking time by the per-route check in the route handler.
  const today = istToday();
  const exceptions = await loadExceptions(svc, null, addDays(today, 1), addDays(today, 21));
  const cutoffHour = cfg.enableBookingTimeWindow ? cfg.cutoffHour : 24;
  const date = bookableDates(new Date(), {
    cutoffHour,
    daysAhead: 1,
    offDates: new Set(exceptions.keys()),
  })[0] ?? null;

  const base: ReminderSummary = { date, reminded: 0, candidates: 0, skipped: null, dryRun };

  if (!cfg.autoNotifyPassengers) {
    return { ...base, skipped: 'autoNotifyPassengers is off' };
  }
  if (!date) {
    return { ...base, skipped: 'no working day is open within the next 21 days' };
  }

  // The EFFECTIVE cutoff, not the raw stored hour: when the daily time window is
  // disabled there is no deadline today, so the copy must not announce one.
  const effectiveCutoff = cfg.enableBookingTimeWindow ? cfg.cutoffHour : null;

  // bookableDates() already excludes a date whose cutoff has passed, so this is
  // now a belt-and-braces guard rather than the primary check.
  if (effectiveCutoff !== null && Date.now() >= cutoffFor(date, effectiveCutoff).getTime()) {
    return { ...base, skipped: `cutoff ${effectiveCutoff}:00 IST already passed for ${date}` };
  }

  const urlMarker = `/student/bookings?d=${date}`;

  const { data: learners } = await svc
    .from('learners_profiles')
    .select('id, profile_id')
    .eq('bus_required', true)
    .not('transport_route_id', 'is', null)
    .not('profile_id', 'is', null);
  const all = (learners ?? []) as LearnerRow[];
  if (all.length === 0) return base;

  const { data: booked } = await svc
    .from('tms_booking')
    .select('learner_id')
    .eq('travel_date', date);
  const bookedIds = new Set<string>(((booked ?? []) as { learner_id: string }[]).map((b) => b.learner_id));

  // Who already received THIS date's reminder — the idempotency guard.
  const { data: priorNotifs } = await svc
    .from('tms_notification')
    .select('id')
    .eq('category', 'booking')
    .eq('url', urlMarker);
  const priorIds = ((priorNotifs ?? []) as { id: string }[]).map((n) => n.id);
  const notifiedProfiles = new Set<string>();
  if (priorIds.length) {
    const { data: recs } = await svc
      .from('tms_notification_recipient')
      .select('user_id')
      .in('notification_id', priorIds);
    for (const r of (recs ?? []) as { user_id: string }[]) notifiedProfiles.add(r.user_id);
  }

  // Only learners who can actually book. The bus_required cohort includes
  // hundreds blocked on an unpaid Term 1, who must not be nagged to book.
  const { data: yearRow } = await svc
    .from('tms_transport_year')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  const yearId = (yearRow as { id: string } | null)?.id ?? null;
  const term1Paid = yearId ? await term1PaidLearnerIds(svc, yearId) : null;

  const targetProfiles = reminderTargets(all, bookedIds, notifiedProfiles, term1Paid);

  const summary = { ...base, candidates: targetProfiles.length };
  if (targetProfiles.length === 0) return summary;
  if (dryRun) return summary; // computed everything, wrote nothing

  const copy = reminderCopy(date, effectiveCutoff);
  const dispatched = await dispatchNotification(svc, {
    title: copy.title,
    body: copy.body,
    category: 'booking',
    priority: 'normal',
    url: urlMarker,
    createdBy: opts.createdBy ?? null,
    targeting: { type: 'users', user_ids: targetProfiles },
  });
  return { ...summary, reminded: dispatched.recipientCount };
}
