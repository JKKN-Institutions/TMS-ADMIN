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

/** The reminder's title/body for a travel date + the CONFIGURED cutoff. Pure. */
export function reminderCopy(date: string, cutoffHour: number): { title: string; body: string } {
  return {
    title: "Book tomorrow's bus",
    body: `Booking for ${date} closes at ${formatCutoffHour(cutoffHour)} today. Tap to reserve your seat.`,
  };
}
