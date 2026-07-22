import type { SupabaseClient } from '@supabase/supabase-js';
import { bookableDates } from './window';
import { loadSchedulingConfig } from '../settings/scheduling';

export interface ReminderSummary {
  date: string;
  reminded: number;
  candidates: number;
  /** Non-null when the run intentionally did nothing (e.g. reminders disabled). */
  skipped: string | null;
  dryRun: boolean;
}

interface LearnerRow { id: string; profile_id: string | null }

/** 24h hour → a short human label ("8 PM"). Pure. */
export function formatCutoffHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** The reminder's title/body for a travel date + the CONFIGURED cutoff. Pure. */
export function reminderCopy(date: string, cutoffHour: number): { title: string; body: string } {
  return {
    title: "Book tomorrow's bus",
    body: `Booking for ${date} closes at ${formatCutoffHour(cutoffHour)} today. Tap to reserve your seat.`,
  };
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
  const date = bookableDates()[0]; // tomorrow
  const base: ReminderSummary = { date, reminded: 0, candidates: 0, skipped: null, dryRun };

  if (!cfg.autoNotifyPassengers) {
    return { ...base, skipped: 'autoNotifyPassengers is off' };
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

  // Dynamic import (not a top-level static import): lib/notifications/dispatch.ts
  // statically imports next/server, and vitest's SSR module loader cannot resolve
  // this file's OTHER `@/...` aliased imports when they sit in the same module as a
  // next/server import (confirmed via isolated repro — unrelated to this file's
  // logic). Deferring the import to call time keeps dispatch.ts out of the module
  // graph for reminders.test.ts, which only exercises the pure copy builders above.
  const { dispatchNotification } = await import('../notifications/dispatch');
  const copy = reminderCopy(date, cfg.cutoffHour);
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
