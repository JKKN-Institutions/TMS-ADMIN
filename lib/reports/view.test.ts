import { describe, expect, it } from 'vitest';
import {
  defaultFilters, istDate, pageInfo, rangeProblem, reportUrl, rupees, shiftDays, totalsOf,
  type ReportFilters,
} from './view';
import type { RouteSummaryRow } from './types';

const F: ReportFilters = {
  from: '2026-11-10', to: '2026-11-16', direction: 'onward',
  routeId: null, booked: null, attendance: null, fee: null,
};

const bus = (over: Partial<RouteSummaryRow>): RouteSummaryRow => ({
  route_id: 'r', route_number: '1', route_name: 'A', learners: 0, service_days: 0, booked: 0, boarded: 0,
  no_show: 0, without_booking: 0, boarded_total: 0, absent_marks: 0, unmarked: 0, auto_absent: 0,
  attendance_pct: null, fees_paid: 0, fees_unpaid: 0, fees_no_bill: 0, amount_owed: 0, ...over,
});

describe('dates', () => {
  it('reads today in IST, not UTC', () => {
    // 20:00 UTC on the 16th is already the 17th in India.
    expect(istDate(Date.parse('2026-11-16T20:00:00Z'))).toBe('2026-11-17');
  });

  it('opens on the last seven days including today', () => {
    const f = defaultFilters('2026-11-17');
    expect([f.from, f.to]).toEqual(['2026-11-11', '2026-11-17']);
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('refuses a backwards or over-long range and accepts a good one', () => {
    expect(rangeProblem('2026-11-10', '2026-11-09')).toMatch(/before/);
    expect(rangeProblem('2026-01-01', '2026-11-09')).toMatch(/186 days or fewer/);
    expect(rangeProblem('', '2026-11-09')).toMatch(/both dates/);
    expect(rangeProblem('2026-11-10', '2026-11-16')).toBeNull();
  });
});

describe('reportUrl', () => {
  it('sends the range and trip to every report', () => {
    expect(reportUrl('buses', F)).toBe('/api/admin/reports/routes?from=2026-11-10&to=2026-11-16&direction=onward');
  });

  it('asks the grouped report for the right grouping', () => {
    expect(reportUrl('institutions', F)).toContain('group=institution');
    expect(reportUrl('departments', F)).toContain('/institutions?');
    expect(reportUrl('departments', F)).toContain('group=department');
  });

  it('sends the learner-only filters to the learner list alone', () => {
    const f: ReportFilters = { ...F, routeId: 'abc', booked: 'yes', attendance: 'absent', fee: 'unpaid' };
    const learners = reportUrl('learners', f, { limit: 100, offset: 200 });
    expect(learners).toContain('route_id=abc');
    expect(learners).toContain('booked=yes');
    expect(learners).toContain('attendance=absent');
    expect(learners).toContain('fee=unpaid');
    expect(learners).toContain('limit=100');
    expect(learners).toContain('offset=200');
    const buses = reportUrl('buses', f);
    expect(buses).toContain('route_id=abc');
    expect(buses).not.toContain('booked=');
    expect(buses).not.toContain('fee=');
  });

  it('can ask for every bus while one is picked, and for a download', () => {
    const f: ReportFilters = { ...F, routeId: 'abc' };
    expect(reportUrl('buses', f, { allBuses: true })).not.toContain('route_id');
    expect(reportUrl('learners', f, { format: 'xlsx' })).toContain('format=xlsx');
  });
});

describe('totalsOf', () => {
  it('adds the buses and recomputes the percentage from the sums', () => {
    const t = totalsOf([
      bus({ learners: 10, booked: 10, boarded: 9, no_show: 1, attendance_pct: 90, amount_owed: '5500.00', fees_unpaid: 1 }),
      bus({ learners: 90, booked: 90, boarded: 9, no_show: 81, without_booking: 4, attendance_pct: 10, amount_owed: 1000 }),
    ]);
    expect(t.buses).toBe(2);
    expect(t.learners).toBe(100);
    expect(t.noShow).toBe(82);
    expect(t.withoutBooking).toBe(4);
    // 18 of 100 booked, not the 50 an average of 90 and 10 would give.
    expect(t.attendancePct).toBe(18);
    expect(t.amountOwed).toBe(6500);
    expect(t.feesUnpaid).toBe(1);
  });

  it('has no percentage when nothing was booked', () => {
    expect(totalsOf([bus({ learners: 5 })]).attendancePct).toBeNull();
    expect(totalsOf([]).buses).toBe(0);
  });
});

describe('display helpers', () => {
  it('writes money in Indian grouping', () => {
    expect(rupees('127500.40')).toBe('₹1,27,500');
    expect(rupees(null)).toBe('₹0');
  });

  it('describes the page a row offset is on', () => {
    expect(pageInfo(250, 100, 0)).toMatchObject({ page: 1, pages: 3, first: 1, last: 100, hasPrev: false, hasNext: true });
    expect(pageInfo(250, 100, 200)).toMatchObject({ page: 3, first: 201, last: 250, hasPrev: true, hasNext: false });
    expect(pageInfo(0, 100, 0)).toMatchObject({ page: 1, pages: 1, first: 0, last: 0, hasNext: false });
  });
});
