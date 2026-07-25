// lib/booking/analytics-dims.ts
/**
 * Pure dimension helpers for booking analytics. No Supabase, no ambient Date —
 * every instant is passed in, so every function is deterministic and testable.
 *
 * Follows lib/booking/window.ts: India has no DST, so IST is a fixed +5:30
 * offset and all date math is integer arithmetic on UTC ms.
 */
import { istToday } from './window';
import type { LeadBucket } from './analytics-types';

/** Whole days from `a` to `b` ('YYYY-MM-DD'); negative when `b` precedes `a`. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** The IST calendar date ('YYYY-MM-DD') of an ISO timestamp. */
export function istDateOf(iso: string): string {
  return istToday(new Date(iso));
}

export const LEAD_BUCKETS: readonly { key: LeadBucket; label: string }[] = [
  { key: 'same_day', label: 'Same day' },
  { key: 'd1', label: '1 day ahead' },
  { key: 'd2_3', label: '2–3 days' },
  { key: 'd4_7', label: '4–7 days' },
  { key: 'd8_plus', label: '8+ days' },
];

/**
 * Days-ahead → bucket. Negative values (booked after the travel date — not
 * constrained by the schema, so possible) clamp into `same_day`.
 */
export function leadTimeBucket(days: number): LeadBucket {
  if (days <= 0) return 'same_day';
  if (days === 1) return 'd1';
  if (days <= 3) return 'd2_3';
  if (days <= 7) return 'd4_7';
  return 'd8_plus';
}

/** How many days ahead a booking was made. */
export function leadDays(bookedAt: string, travelDate: string): number {
  return daysBetween(istDateOf(bookedAt), travelDate);
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** 0 = Monday … 6 = Sunday. Same UTC trick window.ts::isSunday uses. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export type BookedByKind = 'self' | 'admin' | 'unknown';

/** Mirrors the Self/Admin rule in lib/booking/admin-list.ts::toBookingRow. */
export function bookedByLabel(
  bookedBy: string | null,
  profileId: string | null | undefined
): BookedByKind {
  if (!bookedBy) return 'unknown';
  return profileId && bookedBy === profileId ? 'self' : 'admin';
}

/** Percentage to one decimal; 0 when the denominator is 0 (never NaN). */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}
