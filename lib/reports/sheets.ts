/**
 * Report rows → sheet rows. Pure, so the exported file's columns are tested
 * without a spreadsheet library; the route only turns these into a workbook.
 *
 * Rules the headers encode:
 *  - Plain words a transport officer reads, not database names.
 *  - Yes/No rather than true/false, and "—" rather than an empty cell, so a
 *    blank always means "nothing to say" and never "the export broke".
 *  - Money as a NUMBER, so Excel can total a column; everything else as text.
 */
import type { GroupSummaryRow, LearnerReportRow, RouteSummaryRow } from './types';

export type SheetRow = Record<string, string | number>;

const yesNo = (v: boolean): string => (v ? 'Yes' : 'No');
const dash = (v: string | null | undefined): string => (v && v.trim() !== '' ? v : '—');
const money = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? Math.round(n as number) : 0;
};

const ATTENDANCE_WORD: Record<LearnerReportRow['attendance'], string> = {
  present: 'Boarded',
  absent: 'Absent',
  unmarked: 'Not marked',
};

const FEE_WORD: Record<LearnerReportRow['fee_state'], string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  none: 'No bill yet',
};

/** How a mark was made. 'auto' is the job that closes a window, not a person. */
function methodWord(row: LearnerReportRow): string {
  if (row.attendance === 'unmarked') return '—';
  switch (row.method) {
    case 'auto': return 'Auto (window closed)';
    case 'id_card': return 'ID card scan';
    case 'qr_scan': return 'QR scan';
    case 'manual': return 'By hand';
    default: return dash(row.method);
  }
}

function timeOfDay(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  // IST: the trips, the windows and every other screen are in IST.
  // 24-hour, fixed: a locale's am/pm casing differs between machines, and a
  // report read at a bus depot does not need it.
  return t.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function learnerSheetRows(rows: LearnerReportRow[]): SheetRow[] {
  return rows.map((r) => ({
    Date: r.day,
    Name: r.learner_name,
    'Roll number': dash(r.roll_number),
    Mobile: dash(r.mobile),
    Institution: dash(r.institution_name),
    Department: dash(r.department_name),
    Programme: dash(r.program_name),
    Bus: dash(r.route_number),
    'Bus name': dash(r.route_name),
    'Usual bus': dash(r.usual_route_number),
    Stop: dash(r.stop_name),
    Booked: yesNo(r.booked),
    'Booked another bus': dash(r.booked_route_number),
    Attendance: ATTENDANCE_WORD[r.attendance],
    'Marked by': dash(r.marked_by_name),
    'Marked how': methodWord(r),
    'Marked at': timeOfDay(r.marked_at),
    'Boarded without booking': yesNo(r.without_booking),
    'Boarded bus': dash(r.boarded_route_number),
    'Wrong bus': yesNo(r.wrong_bus),
    'Fee status': FEE_WORD[r.fee_state],
    'Amount owed': money(r.amount_owed),
  }));
}

export function routeSheetRows(rows: RouteSummaryRow[]): SheetRow[] {
  return rows.map((r) => ({
    Bus: dash(r.route_number),
    'Bus name': dash(r.route_name),
    Learners: r.learners,
    'Service days': r.service_days,
    Bookings: r.booked,
    Boarded: r.boarded,
    'No show': r.no_show,
    'Boarded without booking': r.without_booking,
    'All boardings': r.boarded_total,
    'Marked absent': r.absent_marks,
    'Not marked': r.unmarked,
    'Auto absent': r.auto_absent,
    'Attendance %': r.attendance_pct ?? '—',
    'Fees paid': r.fees_paid,
    'Fees unpaid': r.fees_unpaid,
    'No bill yet': r.fees_no_bill,
    'Amount owed': money(r.amount_owed),
  }));
}

export function groupSheetRows(rows: GroupSummaryRow[], groupLabel: string): SheetRow[] {
  return rows.map((r) => {
    const out: SheetRow = { [groupLabel]: r.group_name };
    if (r.parent_name) out.Institution = r.parent_name;
    return {
      ...out,
      Learners: r.learners,
      Bookings: r.booked,
      Boarded: r.boarded,
      'No show': r.no_show,
      'Boarded without booking': r.without_booking,
      'All boardings': r.boarded_total,
      'Marked absent': r.absent_marks,
      'Not marked': r.unmarked,
      'Attendance %': r.attendance_pct ?? '—',
      'Fees paid': r.fees_paid,
      'Fees unpaid': r.fees_unpaid,
      'No bill yet': r.fees_no_bill,
      'Amount owed': money(r.amount_owed),
    };
  });
}

/** What the downloaded file is called: report, filters and range, no spaces. */
export function reportFileName(kind: string, from: string, to: string): string {
  const range = from === to ? from : `${from}_to_${to}`;
  return `${kind}-${range}.xlsx`;
}
