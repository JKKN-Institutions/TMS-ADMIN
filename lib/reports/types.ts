/**
 * Shapes returned by the three report functions (see the migrations
 * 20260918120000 / 20260918120100). Field names mirror the SQL columns exactly
 * so a rename shows up as a type error rather than a blank column.
 */

/** One learner on one service day. */
export interface LearnerReportRow {
  day: string;
  learner_id: string;
  learner_name: string;
  roll_number: string | null;
  mobile: string | null;
  institution_name: string | null;
  department_name: string | null;
  program_name: string | null;
  /** The bus they belong to THAT DAY: the booked one, else the allocated one. */
  route_number: string | null;
  route_name: string | null;
  /** Their allocated bus, shown when the day's bus differs. */
  usual_route_number: string | null;
  stop_name: string | null;
  booked: boolean;
  /** Set when they booked a DIFFERENT bus from their allocated one. */
  booked_route_number: string | null;
  attendance: 'present' | 'absent' | 'unmarked';
  method: string | null;
  marked_at: string | null;
  marked_by_name: string | null;
  /** Boarded with no booking for the day. */
  without_booking: boolean;
  boarded_route_number: string | null;
  wrong_bus: boolean;
  fee_state: 'paid' | 'unpaid' | 'none';
  amount_owed: number | string;
  /** The unpaginated count, repeated on every row by the SQL window. */
  total_rows: number;
}

export interface RouteSummaryRow {
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  learners: number;
  service_days: number;
  booked: number;
  /** Booked AND boarded: the numerator of attendance_pct. */
  boarded: number;
  no_show: number;
  without_booking: number;
  boarded_total: number;
  absent_marks: number;
  unmarked: number;
  auto_absent: number;
  attendance_pct: number | null;
  fees_paid: number;
  fees_unpaid: number;
  fees_no_bill: number;
  amount_owed: number | string;
}

export interface GroupSummaryRow {
  group_id: string | null;
  group_name: string;
  /** The institution a department belongs to; null when grouping by institution. */
  parent_name: string | null;
  learners: number;
  booked: number;
  boarded: number;
  no_show: number;
  without_booking: number;
  boarded_total: number;
  absent_marks: number;
  unmarked: number;
  attendance_pct: number | null;
  fees_paid: number;
  fees_unpaid: number;
  fees_no_bill: number;
  amount_owed: number | string;
}
