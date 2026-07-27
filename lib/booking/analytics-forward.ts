// lib/booking/analytics-forward.ts
/**
 * The two forward-looking aggregations: today's marking progress, and upcoming
 * demand. Pure — plain arrays and Maps in, blocks out, no clock read here (the
 * caller passes the dates it wants).
 *
 * These exist because the retrospective tabs answer "what went wrong" over a
 * range that ENDS today, while bookings run ahead of today — 693 of 2,450 rows
 * carry a future travel_date, so a backward-only page cannot see them at all.
 */
import { pct } from './analytics-dims';
import { bump, countRows } from './analytics-bookings';
import type {
  AttendanceRow, BookingRow, CapacityRow, CountRow, Labels, LearnerDim,
  OverCapacityRow, TodayBlock, TodayRouteRow, UpcomingBlock,
} from './analytics-types';

const COHORT_TOP_N = 15;

interface TodayTally {
  booked: number;
  present: number;
  absent: number;
}

/**
 * Marking progress for `date`.
 *
 * `bookings` and `attendance` must BOTH be scoped to `date` and filtered to the
 * same cohort. Record-level filters (direction/status/method) must not be
 * applied to either: this counts how much of the day's roster has been dealt
 * with, so narrowing attendance to `present` would report every absent learner
 * as still-unmarked and send someone to re-scan a bus that was already done.
 *
 * A learner is `marked` once they have ANY attendance row for the day, in
 * either direction — one booking covers both legs. Walk-ups are deliberately
 * excluded: they have no booking, so they are not part of the roster whose
 * progress this measures.
 */
export function aggregateToday(
  date: string,
  bookings: BookingRow[],
  attendance: AttendanceRow[],
  labels: Labels
): TodayBlock {
  const presentLearners = new Set(
    attendance.filter((a) => a.status === 'present').map((a) => a.learner_id)
  );
  const markedLearners = new Set(attendance.map((a) => a.learner_id));

  const routeMap = new Map<string, TodayTally>();
  let present = 0;
  let absent = 0;
  let marked = 0;

  for (const b of bookings) {
    const isPresent = presentLearners.has(b.learner_id);
    // `present` wins over `absent` when a learner has rows of both kinds across
    // the two legs — boarding once is boarding.
    const isMarked = markedLearners.has(b.learner_id);
    if (isMarked) marked += 1;
    if (isPresent) present += 1;
    else if (isMarked) absent += 1;

    const t = routeMap.get(b.route_id) ?? { booked: 0, present: 0, absent: 0 };
    t.booked += 1;
    if (isPresent) t.present += 1;
    else if (isMarked) t.absent += 1;
    routeMap.set(b.route_id, t);
  }

  const byRoute: TodayRouteRow[] = [...routeMap.entries()]
    .map(([id, t]) => ({
      id,
      label: labels.routes.get(id) ?? id,
      booked: t.booked,
      marked: t.present + t.absent,
      present: t.present,
      absent: t.absent,
      unmarked: t.booked - t.present - t.absent,
    }))
    // Least-marked first: this is a worklist, so the routes still needing a
    // scan belong at the top, not the ones already finished.
    .sort((a, b) => b.unmarked - a.unmarked || a.label.localeCompare(b.label));

  return {
    date,
    booked: bookings.length,
    marked,
    present,
    absent,
    unmarked: bookings.length - marked,
    markedPct: pct(marked, bookings.length),
    byRoute,
  };
}

/**
 * Upcoming demand over [from, to] — future travel dates only.
 *
 * No attendance anywhere in this block: none can exist for a date that has not
 * happened, so a show-up rate here would be 0% for structural reasons and read
 * as catastrophe. The forward question is capacity, not compliance.
 *
 * `capacities` maps route id → seats on the assigned vehicle. A route missing
 * from the map has NO known capacity and must surface as such — see
 * CapacityRow.capacity for why tms_route.total_capacity is not the source.
 */
export function aggregateUpcoming(
  from: string,
  to: string,
  bookings: BookingRow[],
  learners: Map<string, LearnerDim>,
  labels: Labels,
  capacities: Map<string, number>
): UpcomingBlock {
  const perDayMap = new Map<string, number>();
  const routeMap = new Map<string, number>();
  const stopMap = new Map<string, number>();
  const deptMap = new Map<string, number>();
  const learnerIds = new Set<string>();
  // (route, date) → count, for both the peak-day and over-capacity readings.
  const routeDay = new Map<string, number>();

  for (const b of bookings) {
    bump(perDayMap, b.travel_date);
    bump(routeMap, b.route_id);
    if (b.stop_id) bump(stopMap, b.stop_id);
    bump(routeDay, `${b.route_id}|${b.travel_date}`);
    learnerIds.add(b.learner_id);
    const d = learners.get(b.learner_id)?.departmentId;
    if (d) bump(deptMap, d);
  }

  const peakByRoute = new Map<string, { date: string; count: number }>();
  const overCapacity: OverCapacityRow[] = [];
  for (const [k, count] of routeDay) {
    const [routeId, date] = k.split('|');
    const best = peakByRoute.get(routeId);
    if (!best || count > best.count) peakByRoute.set(routeId, { date, count });

    const cap = capacities.get(routeId);
    if (cap && count > cap) {
      overCapacity.push({
        routeId,
        label: labels.routes.get(routeId) ?? routeId,
        date,
        booked: count,
        capacity: cap,
      });
    }
  }
  // Worst overflow first — how many learners exceed the seats is the actionable
  // number, not the raw booking count. Earliest date breaks ties, because a
  // shortfall tomorrow needs a decision before one next month.
  overCapacity.sort(
    (a, b) =>
      b.booked - b.capacity - (a.booked - a.capacity) ||
      a.date.localeCompare(b.date) ||
      a.label.localeCompare(b.label)
  );

  const byRoute: CapacityRow[] = countRows(routeMap, labels.routes).map((r) => {
    const capacity = capacities.get(r.id) ?? null;
    const peak = peakByRoute.get(r.id) ?? null;
    return {
      ...r,
      peakDay: peak,
      capacity,
      peakUtilization: capacity && peak ? pct(peak.count, capacity) : null,
    };
  });

  const perDay = [...perDayMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const peakDay = perDay.reduce<{ date: string; count: number } | null>(
    (best, d) => (!best || d.count > best.count ? d : best),
    null
  );

  const byDepartment: CountRow[] = countRows(deptMap, labels.departments);

  return {
    from,
    to,
    kpis: {
      total: bookings.length,
      learners: learnerIds.size,
      routes: routeMap.size,
      days: perDay.length,
      peakDay,
      routesOverCapacity: new Set(overCapacity.map((o) => o.routeId)).size,
      routesWithoutCapacity: byRoute.filter((r) => r.capacity === null).length,
    },
    perDay,
    byRoute,
    byDepartment,
    topStops: countRows(stopMap, labels.stops, COHORT_TOP_N),
    overCapacity,
  };
}
