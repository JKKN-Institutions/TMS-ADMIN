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

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  label: string;
  count: number;
  /** Where clicking the alert takes the admin to act on it. */
  href: string;
}

/** One day on the 7-day activity chart. */
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
  trend: DashboardTrendPoint[];
  /** Empty when the viewer lacks tms.activity.view — not an error. */
  activity: DashboardActivityItem[];
  /** Keys whose underlying query failed. Non-empty => show a degraded banner. */
  degraded: string[];
}
