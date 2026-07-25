// lib/booking/analytics-attendance.ts
/**
 * Attendance aggregation, including the booked↔boarded join.
 *
 * tms_booking and tms_attendance have no FK between them, so the join happens
 * here on (learner_id, date). One booking authorizes BOTH legs of a day, so a
 * learner marked present in EITHER direction counts as boarded exactly once.
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

export function aggregateAttendance(
  bookings: BookingRow[],
  attendance: AttendanceRow[],
  learners: Map<string, LearnerDim>,
  labels: Labels,
  unavailable = false
): AttendanceBlock {
  const key = (learner: string, date: string) => `${learner}:${date}`;

  // Days with at least one attendance row. Bookings on any other day are excluded
  // from the show-up numerator AND denominator — otherwise incomplete scanner
  // rollout would read as learners abandoning their seats.
  const scannedDays = new Set(attendance.map((a) => a.trip_date));

  // (learner, date) pairs that actually boarded — `present` in either direction.
  const boardedKeys = new Set(
    attendance.filter((a) => a.status === 'present').map((a) => key(a.learner_id, a.trip_date))
  );
  const bookingKeys = new Set(bookings.map((b) => key(b.learner_id, b.travel_date)));

  const perDayMap = new Map<string, Tally>();
  const routeMap = new Map<string, Tally>();
  const deptMap = new Map<string, Tally>();
  let bookedOnScannedDays = 0;
  let boarded = 0;

  for (const b of bookings) {
    if (!scannedDays.has(b.travel_date)) continue;
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
  // once per learner-day. Currently zero in production; surfaced so it stays visible.
  const walkUps = new Set(
    attendance
      .filter(
        (a) =>
          a.status === 'present' &&
          (a.is_walk_up || !bookingKeys.has(key(a.learner_id, a.trip_date)))
      )
      .map((a) => key(a.learner_id, a.trip_date))
  ).size;

  const count = <T extends string>(pick: (a: AttendanceRow) => T, value: T) =>
    attendance.filter((a) => pick(a) === value).length;

  return {
    unavailable,
    coverage: {
      routesWithAttendance: new Set(
        attendance.map((a) => a.route_id).filter((v): v is string => !!v)
      ).size,
      routesInRange: new Set(bookings.map((b) => b.route_id)).size,
      daysWithAttendance: scannedDays.size,
      daysInRange: new Set(bookings.map((b) => b.travel_date)).size,
    },
    kpis: {
      records: attendance.length,
      present: count((a) => a.status, 'present'),
      absent: count((a) => a.status, 'absent'),
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
      onward: count((a) => a.direction, 'onward'),
      return: count((a) => a.direction, 'return'),
    },
    byMethod: {
      qr_scan: count((a) => a.method, 'qr_scan'),
      manual: count((a) => a.method, 'manual'),
    },
    byStatus: {
      present: count((a) => a.status, 'present'),
      absent: count((a) => a.status, 'absent'),
    },
    byDepartment: showRows(deptMap, labels.departments).sort(
      (a, b) => a.label.localeCompare(b.label)
    ),
  };
}
