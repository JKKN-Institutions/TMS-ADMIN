import { describe, it, expect } from 'vitest';
import { learnerSheetRows, routeSheetRows, groupSheetRows, reportFileName } from './sheets';
import type { GroupSummaryRow, LearnerReportRow, RouteSummaryRow } from './types';

const learner = (over: Partial<LearnerReportRow> = {}): LearnerReportRow => ({
  day: '2026-09-17',
  learner_id: 'l1',
  learner_name: 'SRI PRASATH P',
  roll_number: 'AUG25CA220',
  mobile: '9876543210',
  institution_name: 'JKKN College of Arts and Science (Self)',
  department_name: 'Computer Applications',
  program_name: 'BCA',
  route_number: '24',
  route_name: 'KOMARAPALAYAM',
  usual_route_number: '49',
  stop_name: 'SANTHAPETTAI',
  booked: true,
  booked_route_number: '24',
  attendance: 'present',
  method: 'id_card',
  marked_at: '2026-09-17T02:12:00.000Z', // 07:42 IST
  marked_by_name: 'FACULTY A',
  without_booking: false,
  boarded_route_number: '24',
  wrong_bus: false,
  fee_state: 'unpaid',
  amount_owed: '7150.00',
  total_rows: 1,
  ...over,
});

describe('learnerSheetRows', () => {
  it('uses words a transport officer reads, not database values', () => {
    const [row] = learnerSheetRows([learner()]);
    expect(row).toMatchObject({
      Date: '2026-09-17',
      Name: 'SRI PRASATH P',
      Bus: '24',
      'Usual bus': '49',
      Booked: 'Yes',
      Attendance: 'Boarded',
      'Marked how': 'ID card scan',
      'Marked by': 'FACULTY A',
      'Boarded without booking': 'No',
      'Fee status': 'Unpaid',
    });
  });

  it('keeps money as a number so a column can be totalled', () => {
    const [row] = learnerSheetRows([learner()]);
    expect(row['Amount owed']).toBe(7150);
    expect(learnerSheetRows([learner({ amount_owed: 0 })])[0]['Amount owed']).toBe(0);
  });

  it('shows the mark time in IST', () => {
    expect(learnerSheetRows([learner()])[0]['Marked at']).toBe('07:42');
  });

  it('writes a dash, never a blank, when there is nothing to say', () => {
    const [row] = learnerSheetRows([learner({
      roll_number: null, mobile: null, department_name: null, stop_name: '  ',
      booked_route_number: null, marked_by_name: null,
    })]);
    expect(row['Roll number']).toBe('—');
    expect(row.Mobile).toBe('—');
    expect(row.Department).toBe('—');
    expect(row.Stop).toBe('—');
    expect(row['Booked another bus']).toBe('—');
    expect(row['Marked by']).toBe('—');
  });

  it('says "Not marked" and leaves the method blank when nobody marked them', () => {
    const [row] = learnerSheetRows([learner({ attendance: 'unmarked', method: null, marked_at: null })]);
    expect(row.Attendance).toBe('Not marked');
    expect(row['Marked how']).toBe('—');
    expect(row['Marked at']).toBe('—');
  });

  it('names the auto-absent job as a job, not a person', () => {
    const [row] = learnerSheetRows([learner({ attendance: 'absent', method: 'auto', marked_by_name: null })]);
    expect(row.Attendance).toBe('Absent');
    expect(row['Marked how']).toBe('Auto (window closed)');
    expect(row['Marked by']).toBe('—');
  });

  it('carries the three fee states', () => {
    expect(learnerSheetRows([learner({ fee_state: 'paid' })])[0]['Fee status']).toBe('Paid');
    expect(learnerSheetRows([learner({ fee_state: 'none' })])[0]['Fee status']).toBe('No bill yet');
  });
});

describe('routeSheetRows', () => {
  const route: RouteSummaryRow = {
    route_id: 'r1', route_number: '49', route_name: 'JALAKANDAPURAM',
    learners: 82, service_days: 5, booked: 300, boarded: 250, no_show: 50,
    without_booking: 20, boarded_total: 270, absent_marks: 30, unmarked: 20,
    auto_absent: 12, attendance_pct: 83.3, fees_paid: 60, fees_unpaid: 20,
    fees_no_bill: 2, amount_owed: '120250',
  };

  it('keeps boarded and all boardings apart', () => {
    const [row] = routeSheetRows([route]);
    expect(row.Boarded).toBe(250);
    expect(row['All boardings']).toBe(270);
    expect(row['Boarded without booking']).toBe(20);
    expect(row['Attendance %']).toBe(83.3);
    expect(row['Amount owed']).toBe(120250);
  });

  it('shows a dash when nobody booked, rather than 0%', () => {
    expect(routeSheetRows([{ ...route, booked: 0, boarded: 0, attendance_pct: null }])[0]['Attendance %']).toBe('—');
  });
});

describe('groupSheetRows', () => {
  const group: GroupSummaryRow = {
    group_id: 'g1', group_name: 'JKKN College of Pharmacy', parent_name: null,
    learners: 293, booked: 1473, boarded: 892, no_show: 581, without_booking: 503,
    boarded_total: 1395, absent_marks: 985, unmarked: 100, attendance_pct: 60.6,
    fees_paid: 206, fees_unpaid: 86, fees_no_bill: 1, amount_owed: 426750,
  };

  it('labels the first column with what is being grouped', () => {
    expect(groupSheetRows([group], 'Institution')[0]).toMatchObject({
      Institution: 'JKKN College of Pharmacy', Learners: 293, 'Attendance %': 60.6,
    });
  });

  it('adds the parent institution when grouping by department', () => {
    const [row] = groupSheetRows(
      [{ ...group, group_name: 'Pharmacy Practice', parent_name: 'JKKN College of Pharmacy' }],
      'Department',
    );
    expect(row.Department).toBe('Pharmacy Practice');
    expect(row.Institution).toBe('JKKN College of Pharmacy');
  });
});

describe('reportFileName', () => {
  it('names one day by its date and a range by both ends', () => {
    expect(reportFileName('learners', '2026-09-18', '2026-09-18')).toBe('learners-2026-09-18.xlsx');
    expect(reportFileName('routes', '2026-09-01', '2026-09-18')).toBe('routes-2026-09-01_to_2026-09-18.xlsx');
  });
});
