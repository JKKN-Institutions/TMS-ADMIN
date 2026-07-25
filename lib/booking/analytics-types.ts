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
  };
  perDay: { date: string; booked: number; boarded: number; noShows: number }[];
  noShowByRoute: ShowRow[];
  byDirection: { onward: number; return: number };
  byMethod: { qr_scan: number; manual: number };
  byStatus: { present: number; absent: number };
  byDepartment: ShowRow[];
}

export interface AnalyticsPayload {
  range: { from: string; to: string };
  facets: Facets;
  bookings: BookingsBlock;
  attendance: AttendanceBlock;
}
