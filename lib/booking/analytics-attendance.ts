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
 * no-show. See AttendanceInput's docstring for why the aggregate takes five
 * separate arrays, each filtered to a different depth.
 */
import { pct } from './analytics-dims';
import type {
  AttendanceBlock, AttendanceRow, BookingRow, LabelMap, Labels, LearnerDim, MarkerRow, ShowRow,
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
 * Every input is named rather than positional, because each one must be filtered
 * to a DIFFERENT depth and passing the wrong array silently produces plausible,
 * wrong numbers that no type error catches. Three separate bugs of exactly this
 * shape were found in review before the signature was made explicit.
 *
 * The governing rule: **a filter selects what you LOOK AT; it must never
 * redefine what you MEASURE AGAINST.**
 *
 * - `attendanceAll` — EVERY attendance row in the date range, with no other
 *   filter whatsoever. Drives only the scanned-route-day gate and the coverage
 *   disclosure. The gate asks "was this route-day scanned by anyone?", so any
 *   narrowing re-reads it as "was THIS COHORT scanned?" — and a cohort that
 *   entirely no-showed leaves zero rows, so its route-day drops out of the
 *   denominator. That deletes exactly the worst days and inflates the show-up
 *   rate. Prod encodes no-shows as absence (178 present vs 3 absent rows), which
 *   makes this failure the common case rather than an edge case.
 * - `attendanceForJoin` — attendance at COHORT depth (route/stop/academic), never
 *   narrowed by direction/status/method. Feeds `boardedKeys` and walk-ups. Record
 *   filters are excluded because a learner present only in the filtered-out
 *   direction would otherwise be miscounted as a no-show.
 * - `attendanceForComposition` — attendance at FULL filter depth. Feeds ONLY
 *   `kpis.records`/`present`/`absent` and `byStatus`/`byDirection`/`byMethod`.
 * - `bookings` — bookings at FULL filter depth. The analysed set: denominator,
 *   `perDay`, `noShowByRoute`, `byDepartment`.
 * - `bookingsForWalkUp` — bookings at COHORT depth, NOT narrowed by `bookedBy`.
 *   A walk-up means "boarded with no booking at all", so the test must see every
 *   booking. `bookedBy` is a booking-only dimension with no attendance
 *   counterpart, so filtering to Admin would hide Self bookings and report their
 *   boarders as walk-ups — measured at 178 against a true value of 0.
 */
export interface AttendanceInput {
  bookings: BookingRow[];
  bookingsForWalkUp: BookingRow[];
  attendanceAll: AttendanceRow[];
  attendanceForJoin: AttendanceRow[];
  attendanceForComposition: AttendanceRow[];
  learners: Map<string, LearnerDim>;
  labels: Labels;
  unavailable?: boolean;
  /**
   * Lowercased emails of the ACTIVE in-charges on the in-scope routes — the
   * population "marked nothing" is measured against.
   *
   * OPTIONAL, unlike buildRosterRows' `viewer`, and for the opposite reason: an
   * empty list cannot unlock anything. It degrades to an honest "0 of 0 assigned
   * in-charges" rather than fabricating absentees, and the route always passes it.
   */
  assignedStaffEmails?: string[];
  /** Marker profiles.id → their lowercased email, for the intersection below. */
  markerEmailById?: Map<string, string>;
  /**
   * Whether the analysed range extends to today. The assignment roster has no
   * effective-dating, so `assignedStaffTotal` is always "who is assigned NOW" —
   * only honest to headline as a per-range figure when the range reaches today.
   * Defaults false so the caveat-bearing note stays hidden unless a caller opts in.
   */
  rangeIncludesToday?: boolean;
}

export function aggregateAttendance({
  bookings,
  bookingsForWalkUp,
  attendanceAll,
  attendanceForJoin,
  attendanceForComposition,
  learners,
  labels,
  unavailable = false,
  assignedStaffEmails = [],
  markerEmailById = new Map(),
  rangeIncludesToday = false,
}: AttendanceInput): AttendanceBlock {
  const key = (learner: string, date: string) => `${learner}:${date}`;

  // The show-up gate is (route, date): production attendance covers a minority
  // of routes (4 of 24 on 2026-07-27), so gating on date alone would let an
  // unscanned route's bookings enter the denominator with zero boardings and
  // rank at the top of "worst routes" — naming well-behaved routes as the worst.
  //
  // A route-less row qualifies NOTHING. `tms_attendance.route_id` is nullable,
  // and such a row cannot be attributed to a route; attributing it to ALL of
  // them reopens the very hole this gate closes, since one row would qualify all
  // 24 routes for that date and the ~20 that never ran a scanner would re-enter
  // the denominator at zero boardings. Dropping it does NOT discard the date —
  // rows that DO carry a route still qualify their own route-day just below, so
  // only the unattributable row contributes nothing. Attributing it to no route
  // under-counts by one row; attributing it to every route fabricates a 100%
  // no-show for every route that was never scanned.
  const scannedRouteDays = new Set(
    attendanceAll
      .filter((a): a is AttendanceRow & { route_id: string } => a.route_id !== null)
      .map((a) => `${a.route_id}:${a.trip_date}`)
  );
  const isScanned = (routeId: string, date: string) =>
    scannedRouteDays.has(`${routeId}:${date}`);

  // (learner, date) pairs that actually boarded — `present` in either direction.
  const boardedKeys = new Set(
    attendanceForJoin
      .filter((a) => a.status === 'present')
      .map((a) => key(a.learner_id, a.trip_date))
  );
  const bookingKeys = new Set(
    bookingsForWalkUp.map((b) => key(b.learner_id, b.travel_date))
  );

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

  // Who did the marking. Routes commonly have 4-12 in-charges sharing one roster,
  // and scanned_by has been recorded since the scanner shipped without ever being
  // read — so a route where four of twelve staff did everything has looked
  // identical to one where all twelve did.
  //
  // Measured over the COMPOSITION population, like byStatus/byDirection/byMethod.
  // The join population is deliberately un-narrowed and would ignore the tab's
  // filters entirely.
  const staffTally = new Map<string, { marks: number; present: number; absent: number }>();
  for (const a of attendanceForComposition) {
    if (!a.scanned_by) continue;
    const t = staffTally.get(a.scanned_by) ?? { marks: 0, present: 0, absent: 0 };
    t.marks += 1;
    if (a.status === 'present') t.present += 1;
    else t.absent += 1;
    staffTally.set(a.scanned_by, t);
  }
  const markedByStaff: MarkerRow[] = [...staffTally.entries()]
    .map(([id, t]) => ({ id, label: labels.staff.get(id) ?? id, ...t }))
    .sort((a, b) => b.marks - a.marks || a.label.localeCompare(b.label));

  // Intersect on EMAIL, not on profile id. tms_staff_route_assignment.staff_email
  // is a raw string (all lowercase in prod) while 6 profiles.email values carry
  // uppercase, so an id-side or exact-string join silently drops those staff and
  // reports working in-charges as having marked nothing.
  //
  // Intersecting rather than subtracting also keeps this correct when a marker
  // holds no assignment at all — a super admin marking a route would otherwise
  // drive the count negative.
  const assigned = new Set(assignedStaffEmails);
  const assignedWhoMarked = new Set(
    [...staffTally.keys()]
      .map((id) => markerEmailById.get(id) ?? '')
      .filter((email) => assigned.has(email)),
  );

  return {
    unavailable,
    // Coverage counts SCANNED SUBSETS of the analysed bookings, not raw
    // attendance totals. Counting distinct routes straight off the attendance
    // array could exceed routesInRange whenever a filter narrows the bookings
    // (e.g. "5 of 2 routes" under a 2-route filter). Framing both sides as
    // "of the routes/days these bookings cover, how many were scanned?" keeps
    // the fraction ≤ 1 by construction.
    coverage: (() => {
      const routes = new Set(bookings.map((b) => b.route_id));
      const days = new Set(bookings.map((b) => b.travel_date));
      // BOTH sides go through isScanned. A date-only test here would count a day
      // as scanned because SOME route ran a scanner that day, even under a route
      // filter selecting a route that has never been scanned — the callout would
      // read "0 of 1 routes across 6 of 14 booked days" when the honest answer is
      // 0 days. Scan calendars are near-disjoint in prod, so any single-route
      // filter hits it.
      const scannedOnSomeBookedRoute = (d: string) => [...routes].some((r) => isScanned(r, d));
      return {
        routesWithAttendance: [...routes].filter((r) =>
          [...days].some((d) => isScanned(r, d))
        ).length,
        routesInRange: routes.size,
        daysWithAttendance: [...days].filter(scannedOnSomeBookedRoute).length,
        daysInRange: days.size,
      };
    })(),
    kpis: {
      records: attendanceForComposition.length,
      present: count(attendanceForComposition, (a) => a.status, 'present'),
      absent: count(attendanceForComposition, (a) => a.status, 'absent'),
      walkUps,
      bookedOnScannedDays,
      boarded,
      showUpRate: pct(boarded, bookedOnScannedDays),
      noShows: bookedOnScannedDays - boarded,
      // From the JOIN population, not the composition one — this caveats the
      // show-up figures, which are themselves never method-filtered.
      manualSharePct: pct(
        count(attendanceForJoin, (a) => a.method, 'manual'),
        attendanceForJoin.length
      ),
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
    // Left in showRows' no-shows-DESCENDING order, like noShowByRoute. An
    // alphabetical re-sort here used to discard the ranking, and the tab slices
    // [0,15] off this array under a "Top 15" label — so the chart showed the
    // alphabetically-first 15 with the tallest bar buried mid-list.
    byDepartment: showRows(deptMap, labels.departments),
    markedByStaff,
    staffWithNoMarks: assigned.size - assignedWhoMarked.size,
    assignedStaffTotal: assigned.size,
    rangeIncludesToday,
  };
}
