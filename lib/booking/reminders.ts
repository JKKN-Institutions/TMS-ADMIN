import type { SupabaseClient } from '@supabase/supabase-js';
import { bookableDates, cutoffFor } from './window';
import { loadSchedulingConfig } from '../settings/scheduling';
import { dispatchNotification } from '../notifications/dispatch';
import { reminderCopy } from './reminder-copy';

// Re-exported so callers have one import site for the reminder API; the pure
// implementations live in ./reminder-copy (see that file for why).
export { formatCutoffHour, reminderCopy } from './reminder-copy';

export interface ReminderSummary {
  date: string;
  reminded: number;
  candidates: number;
  /** Non-null when the run intentionally did nothing (e.g. reminders disabled). */
  skipped: string | null;
  dryRun: boolean;
}

interface LearnerRow { id: string; profile_id: string | null }

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
  const date = bookableDates()[0]; // tomorrow
  const base: ReminderSummary = { date, reminded: 0, candidates: 0, skipped: null, dryRun };

  if (!cfg.autoNotifyPassengers) {
    return { ...base, skipped: 'autoNotifyPassengers is off' };
  }

  // The EFFECTIVE cutoff, not the raw stored hour: when the daily time window is
  // disabled there is no deadline today, so the copy must not announce one.
  const effectiveCutoff = cfg.enableBookingTimeWindow ? cfg.cutoffHour : null;

  // Never send a "book by X" nudge after X has already passed. The cron fires at a
  // FIXED time (17:00 IST) but the cutoff is admin-configurable 0..23, so an earlier
  // cutoff would otherwise produce a reminder for a window that already closed.
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

  const targetProfiles = all
    .filter((l) => !bookedIds.has(l.id) && l.profile_id && !notifiedProfiles.has(l.profile_id))
    .map((l) => l.profile_id as string);

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
