// lib/booking/analytics-attendance.ts
/**
 * Attendance aggregation, including the booked↔boarded join.
 *
 * tms_booking and tms_attendance have no FK between them, so the join happens
 * here on (learner_id, date). One booking authorizes BOTH legs of a day, so a
 * learner marked present in EITHER direction counts as boarded exactly once.
 *
 * The show-up gate is (route, date), not date alone — attendance rollout is
 * partial by ROUTE, and gating on date alone would let an unscanned route's
 * bookings enter the denominator with zero boardings and compute as 100%
 * no-show. See aggregateAttendance's docstring for why it also takes two
 * separate attendance arrays.
 */
import { pct } from './analytics-dims';
import type {
  AttendanceBlock, AttendanceRow, BookingRow, LabelMap, Labels, LearnerDim, ShowRow,
} from './analytics-types';

interface Tally {
  booked: number;
  boarded: number;
}

const tallyOf = (m: Map<string, Tally>, k: string): Tally => {
  const t = m.get(k) ?? { booked: 0, boarded: 0 };
  m.set(k, t);
  return t;
};

function showRows(m: Map<string, Tally>, labelMap: LabelMap): ShowRow[] {
  return [...m.entries()]
    .map(([id, t]) => ({
      id,
      label: labelMap.get(id) ?? id,
      booked: t.booked,
      boarded: t.boarded,
      noShows: t.booked - t.boarded,
      rate: pct(t.booked - t.boarded, t.booked),
    }))
    .sort((a, b) => b.noShows - a.noShows || a.label.localeCompare(b.label));
}

/**
 * `attendanceForJoin` and `attendanceForComposition` are deliberately two
 * separate arrays, not one array filtered differently per caller:
 *
 * - `attendanceForJoin` MUST be the full, unfiltered attendance set for the
 *   range. It drives the scanned-route-day gate, the booked↔boarded join,
 *   walk-ups, coverage, and every booked/boarded/no-show KPI and breakdown
 *   (`bookedOnScannedDays`, `boarded`, `showUpRate`, `noShows`, `perDay`,
 *   `noShowByRoute`, `byDepartment`). If a caller narrows this by
 *   status/direction/method (e.g. a UI filter for "present only" or "onward
 *   only"), the show-up denominator silently shrinks, or a boarder who only
 *   shows up in the filtered-out direction gets miscounted as a no-show — a
 *   record-level filter must never move the show-up rate.
 * - `attendanceForComposition` is whatever set of raw records the caller
 *   wants inspected. It feeds ONLY `kpis.records`/`present`/`absent` and
 *   `byStatus`/`byDirection`/`byMethod`. Callers with no separate filter
 *   applied should pass the same array for both parameters.
 */
export function aggregateAttendance(
  bookings: BookingRow[],
  attendanceForJoin: AttendanceRow[],
  attendanceForComposition: AttendanceRow[],
  learners: Map<string, LearnerDim>,
  labels: Labels,
  unavailable = false
): AttendanceBlock {
  const key = (learner: string, date: string) => `${learner}:${date}`;

  // Distinct dates with at least one attendance row — the coverage disclosure only.
  const scannedDays = new Set(attendanceForJoin.map((a) => a.trip_date));

  // The show-up gate itself is (route, date): production attendance covers a
  // minority of routes, so gating on date alone would let an unscanned
  // route's bookings enter the denominator with zero boardings and rank at
  // the top of "worst routes" — naming well-behaved routes as the worst. A
  // route-less attendance row (route_id null) can't be attributed to a
  // route, so it conservatively qualifies the whole date instead.
  const scannedRouteDays = new Set(
    attendanceForJoin
      .filter((a): a is AttendanceRow & { route_id: string } => a.route_id !== null)
      .map((a) => `${a.route_id}:${a.trip_date}`)
  );
  const scannedDatesUnknownRoute = new Set(
    attendanceForJoin.filter((a) => a.route_id === null).map((a) => a.trip_date)
  );
  const isScanned = (routeId: string, date: string) =>
    scannedRouteDays.has(`${routeId}:${date}`) || scannedDatesUnknownRoute.has(date);

  // (learner, date) pairs that actually boarded — `present` in either direction.
  const boardedKeys = new Set(
    attendanceForJoin
      .filter((a) => a.status === 'present')
      .map((a) => key(a.learner_id, a.trip_date))
  );
  const bookingKeys = new Set(bookings.map((b) => key(b.learner_id, b.travel_date)));

  const perDayMap = new Map<string, Tally>();
  const routeMap = new Map<string, Tally>();
  const deptMap = new Map<string, Tally>();
  let bookedOnScannedDays = 0;
  let boarded = 0;

  for (const b of bookings) {
    if (!isScanned(b.route_id, b.travel_date)) continue;
    const didBoard = boardedKeys.has(key(b.learner_id, b.travel_date));
    bookedOnScannedDays += 1;
    if (didBoard) boarded += 1;

    for (const [m, id] of [
      [perDayMap, b.travel_date],
      [routeMap, b.route_id],
      [deptMap, learners.get(b.learner_id)?.departmentId],
    ] as [Map<string, Tally>, string | null | undefined][]) {
      if (!id) continue;
      const t = tallyOf(m, id);
      t.booked += 1;
      if (didBoard) t.boarded += 1;
    }
  }

  // A boarding with no matching booking (or an explicit is_walk_up flag), counted
  // once per learner-day.
  const walkUps = new Set(
    attendanceForJoin
      .filter(
        (a) =>
          a.status === 'present' &&
          (a.is_walk_up || !bookingKeys.has(key(a.learner_id, a.trip_date)))
      )
      .map((a) => key(a.learner_id, a.trip_date))
  ).size;

  const count = <T extends string>(
    rows: AttendanceRow[], pick: (a: AttendanceRow) => T, value: T
  ) => rows.filter((a) => pick(a) === value).length;

  return {
    unavailable,
    coverage: {
      routesWithAttendance: new Set(
        attendanceForJoin.map((a) => a.route_id).filter((v): v is string => !!v)
      ).size,
      routesInRange: new Set(bookings.map((b) => b.route_id)).size,
      daysWithAttendance: scannedDays.size,
      daysInRange: new Set(bookings.map((b) => b.travel_date)).size,
    },
    kpis: {
      records: attendanceForComposition.length,
      present: count(attendanceForComposition, (a) => a.status, 'present'),
      absent: count(attendanceForComposition, (a) => a.status, 'absent'),
      walkUps,
      bookedOnScannedDays,
      boarded,
      showUpRate: pct(boarded, bookedOnScannedDays),
      noShows: bookedOnScannedDays - boarded,
    },
    perDay: [...perDayMap.entries()]
      .map(([date, t]) => ({
        date,
        booked: t.booked,
        boarded: t.boarded,
        noShows: t.booked - t.boarded,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    noShowByRoute: showRows(routeMap, labels.routes),
    byDirection: {
      onward: count(attendanceForComposition, (a) => a.direction, 'onward'),
      return: count(attendanceForComposition, (a) => a.direction, 'return'),
    },
    byMethod: {
      qr_scan: count(attendanceForComposition, (a) => a.method, 'qr_scan'),
      manual: count(attendanceForComposition, (a) => a.method, 'manual'),
    },
    byStatus: {
      present: count(attendanceForComposition, (a) => a.status, 'present'),
      absent: count(attendanceForComposition, (a) => a.status, 'absent'),
    },
    byDepartment: showRows(deptMap, labels.departments).sort(
      (a, b) => a.label.localeCompare(b.label)
    ),
  };
}
