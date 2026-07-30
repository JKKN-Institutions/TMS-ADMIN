// lib/booking/analytics-types.ts
/**
 * Shared shapes for the Bookings & Attendance analytics endpoint.
 * Types only — no logic, no imports with side effects.
 */

/** A tms_booking row. The LIVE table has no `id` and no `status` column. */
export interface BookingRow {
  learner_id: string;
  travel_date: string; // 'YYYY-MM-DD'
  route_id: string;
  stop_id: string | null;
  booked_at: string; // ISO timestamptz
  booked_by: string | null;
}

/** A tms_attendance row. The date column is `trip_date`, NOT `travel_date`. */
export interface AttendanceRow {
  learner_id: string;
  trip_date: string; // 'YYYY-MM-DD'
  route_id: string | null;
  stop_id: string | null;
  direction: 'onward' | 'return';
  status: 'present' | 'absent';
  method: 'qr_scan' | 'manual';
  is_walk_up: boolean;
  /** profiles.id of the staff member who marked it. Nullable: `on delete set null`. */
  scanned_by: string | null;
}

/** The learner attributes analytics slices by. */
export interface LearnerDim {
  id: string;
  profileId: string | null;
  institutionId: string | null;
  departmentId: string | null;
  programId: string | null;
}

export type LabelMap = Map<string, string>;

export interface Labels {
  routes: LabelMap;
  stops: LabelMap;
  institutions: LabelMap;
  departments: LabelMap;
  programs: LabelMap;
  /** Attendance markers, by profiles.id. */
  staff: LabelMap;
}

export interface AnalyticsFilters {
  routeIds: string[];
  stopIds: string[];
  institutionIds: string[];
  departmentIds: string[];
  programIds: string[];
  bookedBy: 'self' | 'admin' | null;
  direction: 'onward' | 'return' | null;
  attStatus: 'present' | 'absent' | null;
  method: 'qr_scan' | 'manual' | null;
}

export const EMPTY_FILTERS: AnalyticsFilters = {
  routeIds: [],
  stopIds: [],
  institutionIds: [],
  departmentIds: [],
  programIds: [],
  bookedBy: null,
  direction: null,
  attStatus: null,
  method: null,
};

export interface FacetOption {
  id: string;
  label: string;
}
export interface StopFacetOption extends FacetOption {
  routeId: string | null;
}

export interface Facets {
  routes: FacetOption[];
  stops: StopFacetOption[];
  institutions: FacetOption[];
  departments: FacetOption[];
  programs: FacetOption[];
}

export interface CountRow extends FacetOption {
  count: number;
}

/** A cohort's booked/boarded/no-show triple. `rate` is the NO-SHOW percentage. */
export interface ShowRow extends FacetOption {
  booked: number;
  boarded: number;
  noShows: number;
  rate: number;
}

export type LeadBucket = 'same_day' | 'd1' | 'd2_3' | 'd4_7' | 'd8_plus';

export interface BookingsBlock {
  kpis: {
    total: number;
    learners: number;
    routes: number;
    days: number;
    avgPerDay: number;
    selfPct: number;
    peakDay: { date: string; count: number } | null;
  };
  perDay: { date: string; count: number }[];
  byRoute: CountRow[];
  leadTime: { bucket: LeadBucket; label: string; count: number }[];
  byWeekday: { weekday: number; label: string; count: number }[];
  bookedBy: { self: number; admin: number; unknown: number };
  byInstitution: CountRow[];
  byDepartment: CountRow[];
  topStops: CountRow[];
}

/** One boarding staff member's marking output over the filtered range. */
export interface MarkerRow extends FacetOption {
  marks: number;
  present: number;
  absent: number;
}

export interface AttendanceBlock {
  unavailable: boolean;
  coverage: {
    routesWithAttendance: number;
    routesInRange: number;
    daysWithAttendance: number;
    daysInRange: number;
  };
  kpis: {
    records: number;
    present: number;
    absent: number;
    walkUps: number;
    /** Bookings on days that have at least one attendance row — the show-up denominator. */
    bookedOnScannedDays: number;
    /** Distinct (learner, date) pairs that were booked AND marked present. */
    boarded: number;
    showUpRate: number;
    noShows: number;
    /**
     * Percent of the ANALYSED attendance captured manually rather than scanned.
     * Deliberately measured over the cohort (non-method-filtered) population,
     * because it is a data-quality caveat ON the show-up figures — computing it
     * from the method-filtered records would make `?method=qr_scan` report 0%
     * and silently retract a warning that is genuinely warranted.
     */
    manualSharePct: number;
  };
  perDay: { date: string; booked: number; boarded: number; noShows: number }[];
  noShowByRoute: ShowRow[];
  byDirection: { onward: number; return: number };
  byMethod: { qr_scan: number; manual: number };
  byStatus: { present: number; absent: number };
  byDepartment: ShowRow[];
  /**
   * Who did the marking, busiest first. Routes commonly have 4-12 in-charges
   * sharing one roster (route 16 has 12), so this is the only place the office
   * can see how few of them actually mark.
   */
  markedByStaff: MarkerRow[];
  /** Assigned in-charges on the in-scope routes with zero marks in the range. */
  staffWithNoMarks: number;
  assignedStaffTotal: number;
  /** True when the selected range reaches today, so the current roster is a fair denominator. */
  rangeIncludesToday: boolean;
  /** True when a non-route filter narrows the marks counted but not the assignment roster. */
  numeratorFiltered: boolean;
}

/** One route's upcoming load measured against its assigned vehicle's seats. */
export interface CapacityRow extends CountRow {
  /** Busiest single upcoming day for this route. */
  peakDay: { date: string; count: number } | null;
  /**
   * Seats on the route's assigned vehicle, or null when unknown.
   * NOTE: read from tms_vehicle.capacity via tms_route.vehicle_id, NOT from
   * tms_route.total_capacity — that column is never written (0/null on 23 of 24
   * routes) and rendering it would show every route at 0 seats. 18 of 24 routes
   * currently resolve to a real capacity; the rest must render as "unknown"
   * rather than as a fabricated 0.
   */
  capacity: number | null;
  /** peakDay.count as a percent of capacity; null whenever capacity is null. */
  peakUtilization: number | null;
}

/** A specific upcoming route-day whose bookings exceed the vehicle's seats. */
export interface OverCapacityRow {
  routeId: string;
  label: string;
  date: string;
  booked: number;
  capacity: number;
}

/** Forward-looking demand. No attendance: none can exist for a future date. */
export interface UpcomingBlock {
  from: string;
  to: string;
  kpis: {
    total: number;
    learners: number;
    routes: number;
    days: number;
    peakDay: { date: string; count: number } | null;
    routesOverCapacity: number;
    /** Routes whose utilization is unknowable — no vehicle or no capacity on record. */
    routesWithoutCapacity: number;
  };
  perDay: { date: string; count: number }[];
  byRoute: CapacityRow[];
  byDepartment: CountRow[];
  topStops: CountRow[];
  overCapacity: OverCapacityRow[];
}

export interface TodayRouteRow extends FacetOption {
  booked: number;
  marked: number;
  present: number;
  absent: number;
  unmarked: number;
}

/**
 * Live marking progress for one date. Operational, not analytical: it answers
 * "who still needs scanning right now", so `unmarked` is the headline rather
 * than a rate. present + absent + unmarked === booked, by construction.
 */
export interface TodayBlock {
  date: string;
  booked: number;
  marked: number;
  present: number;
  absent: number;
  unmarked: number;
  markedPct: number;
  /** Routes booked today, least-marked first — the operational worklist. */
  byRoute: TodayRouteRow[];
}

export interface AnalyticsPayload {
  range: { from: string; to: string };
  facets: Facets;
  bookings: BookingsBlock;
  attendance: AttendanceBlock;
  today: TodayBlock;
  upcoming: UpcomingBlock;
}
