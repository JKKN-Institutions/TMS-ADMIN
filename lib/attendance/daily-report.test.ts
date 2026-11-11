import { describe, it, expect } from 'vitest';
import {
  buildDailyReport,
  classifyDay,
  shiftDate,
  summarizeRows,
  type RawDailyDay,
  type RawDailyRoute,
} from './daily-report';

const day = (d: string, over: Partial<RawDailyDay> = {}): RawDailyDay => ({
  d, p: 0, s: 0, a: 0, o: 0, m: 0, f: null, l: null, x: false, ...over,
});

const route = (id: string, days: RawDailyDay[], over: Partial<RawDailyRoute> = {}): RawDailyRoute => ({
  route_id: id, route_number: id, route_name: `Route ${id}`, has_bus: true,
  roster: 100, incharges: 3, days, ...over,
});

describe('classifyDay', () => {
  const base = { roster: 100, staffAbsent: 0, isHoliday: false };

  it('a holiday wins over every count', () => {
    expect(classifyDay({ ...base, present: 80, isHoliday: true })).toBe('no_service');
  });

  it('no staff mark is not_marked', () => {
    expect(classifyDay({ ...base, present: 0 })).toBe('not_marked');
  });

  it('under a fifth of the bus scanned is low', () => {
    expect(classifyDay({ ...base, present: 19 })).toBe('low');
    expect(classifyDay({ ...base, present: 20 })).toBe('marked');
  });

  it('a staff-marked absence counts as the bus being marked', () => {
    expect(classifyDay({ ...base, present: 0, staffAbsent: 5 })).toBe('low');
  });

  it('a bus with no allocated learners is never low', () => {
    expect(classifyDay({ ...base, roster: 0, present: 1 })).toBe('marked');
  });
});

describe('buildDailyReport', () => {
  const D1 = '2026-11-04';
  const D2 = '2026-11-05';
  const D3 = '2026-11-06';

  it('counts present, absent and not marked for the chosen day', () => {
    const r = buildDailyReport(
      [route('05', [day(D3, { p: 40, a: 26, m: 4, f: '08:07', l: '08:11' })], { roster: 66 })],
      D3,
    );
    const row = r.rows[0];
    expect(row).toMatchObject({
      status: 'marked', marked: 66, present: 40, absent: 26, autoAbsent: 26, notMarked: 0,
      markers: 4, firstScan: '08:07', lastScan: '08:11',
    });
    expect(row.presentPct).toBe(60.6);
    expect(r.totals).toMatchObject({ buses: 1, busesMarked: 1, learners: 66, present: 40, absent: 26 });
  });

  it('a bus nobody scanned has no counts and its whole roster is not marked', () => {
    // 3 stray auto rows (learners who booked this bus) must not read as "marked".
    const r = buildDailyReport(
      [
        route('37', [day(D3, { a: 3 })], { roster: 98, incharges: 0 }),
        route('05', [day(D3, { p: 40, a: 26 })], { roster: 66 }),
      ],
      D3,
    );
    expect(r.rows[0]).toMatchObject({
      status: 'not_marked', marked: 0, present: 0, absent: 0, notMarked: 98, presentPct: null,
    });
    expect(r.totals).toMatchObject({ buses: 2, busesMarked: 1, notMarked: 98, marked: 66 });
  });

  it('splits unmarked buses by whether an in-charge is assigned', () => {
    const r = buildDailyReport(
      [
        route('10', [day(D3)], { incharges: 0 }),
        route('13', [day(D3)], { incharges: 5 }),
        route('05', [day(D3, { p: 50, a: 50 })]),
      ],
      D3,
    );
    expect(r.actions.noIncharge.map((x) => x.routeNumber)).toEqual(['10']);
    expect(r.actions.notScanned.map((x) => x.routeNumber)).toEqual(['13']);
    expect(r.actions.low).toEqual([]);
  });

  it('lists low-scanning buses, weakest first', () => {
    const r = buildDailyReport(
      [
        route('34', [day(D3, { p: 17, a: 83 })]),
        route('40', [day(D3, { p: 11, a: 89 })]),
        route('05', [day(D3, { p: 60, a: 40 })]),
      ],
      D3,
    );
    expect(r.actions.low.map((x) => x.routeNumber)).toEqual(['40', '34']);
  });

  it('counts the unmarked streak and finds the last marked day', () => {
    const r = buildDailyReport(
      [
        route('32', [day(D1, { p: 30, a: 70 }), day(D2), day(D3)]),
        route('05', [day(D1, { p: 50 }), day(D2, { p: 50 }), day(D3, { p: 50 })]),
      ],
      D3,
    );
    expect(r.rows[0]).toMatchObject({ status: 'not_marked', unmarkedDays: 2, lastMarked: D1 });
  });

  it('a day nobody marked anywhere, and a holiday, do not lengthen a streak', () => {
    const r = buildDailyReport(
      [
        // D1 marked nowhere (undeclared holiday); D2 is a declared holiday.
        route('32', [day('2026-11-03', { p: 30 }), day(D1), day(D2, { x: true }), day(D3)]),
        route('05', [day('2026-11-03', { p: 50 }), day(D1), day(D2, { x: true }), day(D3, { p: 50 })]),
      ],
      D3,
    );
    expect(r.rows[0]).toMatchObject({ unmarkedDays: 1, lastMarked: '2026-11-03' });
  });

  it('a day with no marks on any bus is one message, not a list of failures', () => {
    const r = buildDailyReport(
      [route('05', [day(D2, { p: 50 }), day(D3)]), route('06', [day(D2, { p: 40 }), day(D3)])],
      D3,
    );
    expect(r.nothingMarked).toBe(true);
    expect(r.actions).toEqual({ noIncharge: [], notScanned: [], low: [] });
    expect(r.totals.notMarked).toBe(200);
  });

  it('a fleet-wide holiday is reported as a holiday with no learners owed', () => {
    const r = buildDailyReport([route('05', [day(D3, { x: true })])], D3);
    expect(r.holiday).toBe(true);
    expect(r.nothingMarked).toBe(false);
    expect(r.rows[0]).toMatchObject({ status: 'no_service', notMarked: 0 });
    expect(r.totals.buses).toBe(0);
  });

  it('an empty bus is never an action', () => {
    const r = buildDailyReport(
      [route('99', [day(D3)], { roster: 0, incharges: 0 }), route('05', [day(D3, { p: 50 })])],
      D3,
    );
    expect(r.actions.noIncharge).toEqual([]);
  });

  it('a Sunday (no such day in the series) returns no rows but keeps the trend', () => {
    const r = buildDailyReport([route('05', [day(D3, { p: 50 })])], '2026-11-08');
    expect(r.noData).toBe(true);
    expect(r.rows).toEqual([]);
  });

  it('gives the previous marked day for comparison, skipping empty days', () => {
    const r = buildDailyReport(
      [route('05', [day(D1, { p: 45 }), day(D2), day(D3, { p: 50 })])],
      D3,
    );
    expect(r.previous).toEqual({ date: D1, present: 45 });
    expect(r.trend.map((t) => [t.date, t.present, t.nothingMarked])).toEqual([
      [D1, 45, false], [D2, 0, true], [D3, 50, false],
    ]);
  });

  it('keeps at most the last 7 days in the trend, ending on the chosen day', () => {
    const days = Array.from({ length: 10 }, (_, i) => day(shiftDate('2026-11-02', i), { p: 10 + i }));
    const r = buildDailyReport([route('05', days)], '2026-11-10');
    expect(r.trend).toHaveLength(7);
    expect(r.trend[6].date).toBe('2026-11-10');
  });

  it('hostel and irregular riders are reported beside the totals, not inside', () => {
    const r = buildDailyReport([route('05', [day(D3, { p: 50, a: 50, o: 4 })])], D3);
    expect(r.rows[0]).toMatchObject({ marked: 100, offRoster: 4 });
    expect(r.totals.offRoster).toBe(4);
  });
});

describe('summarizeRows', () => {
  it('totals only the rows it is given', () => {
    const r = buildDailyReport(
      [
        route('05', [day('2026-11-06', { p: 50, a: 50 })]),
        route('06', [day('2026-11-06', { p: 30, a: 70 })]),
      ],
      '2026-11-06',
    );
    expect(summarizeRows(r.rows.slice(0, 1))).toMatchObject({ buses: 1, present: 50, presentPct: 50 });
  });
});

describe('shiftDate', () => {
  it('crosses month and year ends', () => {
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
