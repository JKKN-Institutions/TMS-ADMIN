/**
 * Pure copy builders for the daily booking reminder.
 *
 * Deliberately kept in their OWN module with zero imports: the send routine in
 * ./reminders.ts pulls in lib/notifications/dispatch, which transitively imports
 * `next/server`. Keeping the pure functions separate means their unit tests never
 * drag that runtime-only chain into the test environment — the same pure/impure
 * split used by lib/booking/window.ts.
 */

/** 24h hour → a short human label ("8 PM"). Pure. */
export function formatCutoffHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/**
 * The reminder's title/body for a travel date + the EFFECTIVE cutoff. Pure.
 *
 * `cutoffHour === null` means the admin turned the daily time window OFF, so there
 * is no "closes at X" deadline that day — booking stays open through today. Passing
 * the raw configured hour in that case would announce a deadline that does not
 * exist, which is worse than announcing none.
 */
export function reminderCopy(date: string, cutoffHour: number | null): { title: string; body: string } {
  const deadline =
    cutoffHour === null
      ? `Booking for ${date} stays open through today.`
      : `Booking for ${date} closes at ${formatCutoffHour(cutoffHour)} today.`;
  return {
    title: "Book tomorrow's bus",
    body: `${deadline} Tap to reserve your seat.`,
  };
}
