// lib/booking/analytics-bookings.ts
/** Bookings-tab aggregation. Pure: plain arrays and Maps in, a BookingsBlock out. */
import {
  LEAD_BUCKETS, WEEKDAY_LABELS, bookedByLabel, leadDays, leadTimeBucket, pct, weekdayOf,
} from './analytics-dims';
import type {
  BookingRow, BookingsBlock, CountRow, LabelMap, Labels, LeadBucket, LearnerDim,
} from './analytics-types';

export const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

/**
 * Map → labelled rows, ranked by count then label. `top` trims the tail.
 * Exported so the forward-looking aggregation ranks and labels identically —
 * two ranking conventions across one page is how a "Top 15" ends up alphabetical.
 */
export function countRows(m: Map<string, number>, labelMap: LabelMap, top?: number): CountRow[] {
  const out = [...m.entries()]
    .map(([id, count]) => ({ id, label: labelMap.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return top ? out.slice(0, top) : out;
}

export function aggregateBookings(
  rows: BookingRow[],
  learners: Map<string, LearnerDim>,
  labels: Labels
): BookingsBlock {
  const perDayMap = new Map<string, number>();
  const routeMap = new Map<string, number>();
  const stopMap = new Map<string, number>();
  const instMap = new Map<string, number>();
  const deptMap = new Map<string, number>();
  const leadMap = new Map<LeadBucket, number>();
  const weekMap = new Map<number, number>();
  const learnerIds = new Set<string>();
  const bookedBy = { self: 0, admin: 0, unknown: 0 };

  for (const b of rows) {
    bump(perDayMap, b.travel_date);
    bump(routeMap, b.route_id);
    if (b.stop_id) bump(stopMap, b.stop_id);
    bump(leadMap, leadTimeBucket(leadDays(b.booked_at, b.travel_date)));
    bump(weekMap, weekdayOf(b.travel_date));
    learnerIds.add(b.learner_id);

    const l = learners.get(b.learner_id);
    if (l?.institutionId) bump(instMap, l.institutionId);
    if (l?.departmentId) bump(deptMap, l.departmentId);
    bookedBy[bookedByLabel(b.booked_by, l?.profileId)] += 1;
  }

  const perDay = [...perDayMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const peakDay = perDay.reduce<{ date: string; count: number } | null>(
    (best, d) => (!best || d.count > best.count ? d : best),
    null
  );

  return {
    kpis: {
      total: rows.length,
      learners: learnerIds.size,
      routes: routeMap.size,
      days: perDay.length,
      // Divided by days that HAVE bookings — a calendar-day divisor would report a
      // misleadingly low average across weekends and holidays.
      avgPerDay: perDay.length ? Math.round((rows.length / perDay.length) * 10) / 10 : 0,
      selfPct: pct(bookedBy.self, rows.length),
      peakDay,
    },
    perDay,
    byRoute: countRows(routeMap, labels.routes),
    leadTime: LEAD_BUCKETS.map(({ key, label }) => ({
      bucket: key,
      label,
      count: leadMap.get(key) ?? 0,
    })),
    byWeekday: WEEKDAY_LABELS.map((label, i) => ({
      weekday: i,
      label,
      count: weekMap.get(i) ?? 0,
    })),
    bookedBy,
    byInstitution: countRows(instMap, labels.institutions),
    byDepartment: countRows(deptMap, labels.departments),
    topStops: countRows(stopMap, labels.stops, 15),
  };
}
