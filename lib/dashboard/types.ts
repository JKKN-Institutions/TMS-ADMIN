// Shared shapes for the admin dashboard payload (/api/admin/dashboard).
//
// Design rule for this module: a number that could not be measured is NEVER
// reported as 0. Every failed query names itself in `degraded` so the UI can
// render "—" instead of a confident zero. The previous dashboard wrote
// `.count || 0` against the DROPPED legacy `bookings` table, which made
// "table does not exist" indistinguishable from "no bookings today" — the page
// displayed 0 bookings for months while tms_booking held 18k rows.

/** A count plus the same count one period earlier, for real trend arrows. */
export interface Metric {
  current: number;
  /** null when no baseline could be measured — render no arrow, not a fake one. */
  previous: number | null;
}

/**
 * `unknown` is not a severity in the usual sense — it is the honest fourth
 * state the tracking board already uses (its grey "not set up" rows). A check
 * that could not run is neither a problem nor an all-clear, and it must stay
 * visible instead of silently disappearing from the list.
 */
export type AlertSeverity = 'critical' | 'warning' | 'info' | 'unknown';

/**
 * One row of the "Needs attention" board, shaped like a tracking row:
 * a state chip, a plain-English reason, the specific things affected, and a
 * single next step.
 */
export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  /** Full headline including the count, e.g. "9 buses with an expired document". */
  label: string;
  /**
   * The headline WITHOUT the count, e.g. "buses with an expired document".
   * The row renders the count as its own bold identifier — the same way a
   * tracking row leads with the route number — so it must not be repeated.
   */
  subject: string;
  count: number;
  /** Short chip text naming the state, e.g. "Document expired". */
  state: string;
  /** One plain-English sentence: what this actually means for operations. */
  reason: string;
  /** The specific things affected, e.g. route numbers or bus registrations. */
  items?: string[];
  /** Noun for `items`, e.g. "Routes". Rendered as the list heading. */
  itemsLabel?: string;
  /** What to actually do about it. An alert with no next step is just noise. */
  action?: string;
  /**
   * Where acting on the alert takes the admin. Absent when there is nowhere to
   * go — an unmeasured check has no fix page.
   */
  href?: string;
}

/**
 * One route on the operations board — the dashboard's main object.
 *
 * `boarded` can legitimately EXCEED `booked`: walk-up riders are scanned
 * without a booking (tms_attendance.is_walk_up). So this is not a percentage
 * bounded at 100, and the UI must not clamp it silently — a route carrying
 * more people than it booked is a real signal, not a rendering bug.
 */
export interface DashboardRouteRow {
  id: string;
  routeNumber: string;
  routeName: string;
  /** Operator's own code for the route, e.g. 'METTUR NO 5'. */
  routeCode: string | null;
  /** Where the run begins; the end is almost always the college. */
  startLocation: string | null;
  endLocation: string | null;
  /** 'HH:MM:SS' as stored. Formatting to 7:30 am belongs to the view. */
  departureTime: string | null;
  arrivalTime: string | null;
  /** Free text as stored, e.g. '1h 25m' — NOT a number of minutes. */
  duration: string | null;
  /** Stops on the route, counted live from tms_route_stop. */
  stops: number;
  /** Registration of the assigned bus, or null when no bus is assigned. */
  vehicleRegistration: string | null;
  /** Seats on the assigned bus. null when no bus, so no denominator exists. */
  capacity: number | null;
  hasDriver: boolean;
  /** Driver's name, or null when unassigned or not resolvable. */
  driverName: string | null;
  /** Today's trip status from tms_trip, or null if no trip was started. */
  tripStatus: string | null;
  booked: number;
  boarded: number;
}
//
// Deliberately absent: `distance` and `fare`. Both columns exist on tms_route
// but are unpopulated in practice (24 of 25 active routes have distance 0, and
// all 25 have fare 0), so surfacing them would print a confident "0 km / ₹0"
// for every route. Same reason tms_route.current_passengers/total_capacity are
// never read anywhere: a column that is never written is not data.

/** One hour of scanning activity. */
export interface DashboardHourBucket {
  /** Hour of the day in IST, 0-23. */
  hour: number;
  marks: number;
  present: number;
}

/** One day on the demand chart. */
export interface DashboardTrendPoint {
  /** IST calendar date, YYYY-MM-DD. */
  date: string;
  bookings: number;
  present: number;
}

export interface DashboardActivityItem {
  id: string;
  module: string;
  action: string;
  entityLabel: string | null;
  description: string | null;
  actorEmail: string | null;
  createdAt: string;
}

export interface DashboardPayload {
  counts: {
    learners: Metric;
    drivers: Metric;
    routes: Metric;
    vehicles: Metric;
  };
  today: {
    /** IST calendar date the "today" block was computed for. */
    date: string;
    bookings: number;
    bookingsTomorrow: number;
    attendanceMarked: number;
    present: number;
    absent: number;
    tripsToday: number;
    tripsActive: number;
    /**
     * Scans bucketed by IST hour. Boarding is a short morning event here
     * (measured: 138 scans at 7am, 1,094 at 8am), so this is a burst profile,
     * not an all-day curve — the UI should only plot hours that have data.
     */
    hourly: DashboardHourBucket[];
  };
  /**
   * The same figures for the previous day WITH data, so the KPI strip can show
   * a real change. Null when no earlier day could be measured — in which case
   * no delta is drawn rather than a fabricated one.
   */
  yesterday: {
    date: string;
    bookings: number;
    present: number;
    absent: number;
  } | null;
  /**
   * The three counted categories in the "Needs attention" band, each with a
   * measured comparison where one exists.
   */
  attention: {
    /** Bus Pass service requests still sitting in draft or submitted. */
    busPassOpen: number;
    busPassLast30: number;
    /** The 30 days before that, so the change is measured and not invented. */
    busPassPrev30: number;
    /**
     * Buses with at least one EXPIRED statutory document, and those falling due
     * inside 60 days. Named generically on purpose: measured 2026-09-04, only
     * pollution certificates have actually expired (9) — insurance, fitness and
     * permit are all zero — so labelling this "Fitness expiry" would print a
     * document type that has no data behind it.
     */
    docsExpired: number;
    docsDueSoon: number;
    /** Routes running below LOW_OCCUPANCY_PCT of their bus's seats. */
    lowOccupancy: number;
    /** Routes that have a bus, i.e. the denominator for lowOccupancy. */
    routesWithCapacity: number;
  };
  /** Fleet readiness — counts only, no live telemetry (see the note below). */
  fleet: {
    buses: number;
    /** Buses with at least one expired statutory document. */
    expiredDocs: number;
    routesActive: number;
    routesWithoutBus: number;
    routesWithoutDriver: number;
  };
  finance: {
    collectedToday: number;
    collectedMonth: number;
    collectedTotal: number;
    outstanding: number;
    paidBills: number;
    unpaidBills: number;
    overdueBills: number;
  };
  alerts: DashboardAlert[];
  /**
   * Active routes with today's figures, for the utilisation bars and the route
   * performance table. Sourced from the SAME loader as Routes > Analytics so
   * the two screens can never quote different numbers for the same route.
   */
  routes: DashboardRouteRow[];
  trend: DashboardTrendPoint[];
  /** Empty when the viewer lacks tms.activity.view — not an error. */
  activity: DashboardActivityItem[];
  /** Keys whose underlying query failed. Non-empty => show a degraded banner. */
  degraded: string[];
}
