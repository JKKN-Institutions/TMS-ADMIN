import { describe, it, expect } from 'vitest';
import {
  bandCounts, buildMarkingReport, classifyCell, monthDays, summarizeCells, summarizeDay, toYearRows,
  type InchargeInput, type MarkingInputs,
} from './incharge-marking';

const ic = (over: Partial<InchargeInput> = {}): InchargeInput => ({
  assignmentId: 'a1', routeId: 'r1', routeNumber: '16', routeName: 'GOBI',
  name: 'Kumar', email: 'kumar@jkkn.ac.in', emails: new Set(['kumar@jkkn.ac.in']),
  profileId: 'p1', startDate: '2026-11-01', ...over,
});

// Mon 2 Nov – Sat 7 Nov 2026, Sun 8 Nov; "today" is Sat 7 Nov.
const base = (over: Partial<MarkingInputs> = {}): MarkingInputs => ({
  days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
  today: '2026-11-07',
  incharges: [ic()],
  marks: { person_days: [], route_days: [], fleet_days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'] },
  calendarOff: [],
  excused: [],
  absences: [],
  ...over,
});

describe('classifyCell', () => {
  const c = { date: '2026-11-03', today: '2026-11-07', startDate: '2026-11-01', serviceDay: true, own: 0, bus: 0, onLeave: false };
  it('own scans win over everything', () => {
    expect(classifyCell({ ...c, own: 3, serviceDay: false, onLeave: true })).toBe('marked');
  });
  it('a colleague scanning the bus is still Not marked for this person', () => expect(classifyCell({ ...c, bus: 20 })).toBe('missed'));
  it('nobody scanned the bus', () => expect(classifyCell(c)).toBe('missed'));
  it('today with nothing yet is Not marked', () => expect(classifyCell({ ...c, date: '2026-11-07' })).toBe('missed'));
  it('declared leave is no duty, not a status', () => expect(classifyCell({ ...c, bus: 5, onLeave: true })).toBe('off'));
  it('no service day', () => expect(classifyCell({ ...c, serviceDay: false })).toBe('off'));
  it('before assignment and future dates are n/a', () => {
    expect(classifyCell({ ...c, startDate: '2026-11-05' })).toBe('na');
    expect(classifyCell({ ...c, date: '2026-11-09' })).toBe('na');
  });
});

describe('buildMarkingReport', () => {
  it('scores each day and the month totals', () => {
    const rows = buildMarkingReport(base({
      marks: {
        person_days: [
          { profile_id: 'p1', email: 'kumar@jkkn.ac.in', d: '2026-11-02', n: 12, first: '07:40', last: '08:05' },
          // matched by a different address of the same person (no profile link)
          { profile_id: 'p9', email: 'KUMAR@jkkn.ac.in', d: '2026-11-03', n: 4, first: '07:50', last: '07:58' },
        ],
        route_days: [
          { route_id: 'r1', d: '2026-11-02', n: 30 },
          { route_id: 'r1', d: '2026-11-03', n: 30 },
          { route_id: 'r1', d: '2026-11-04', n: 25 },
        ],
        fleet_days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
      },
      calendarOff: [{ date: '2026-11-06', routeId: null }],
      absences: [{ assignment_id: 'a1', absence_date: '2026-11-05', covering_assignment_id: null, cover_status: 'uncovered' }],
    }));
    const r = rows[0];
    expect(r.cells['2026-11-02']).toEqual({ s: 'marked', n: 12, bus: 30, first: '07:40', last: '08:05' });
    expect(r.cells['2026-11-03'].s).toBe('marked');
    expect(r.cells['2026-11-04'].s).toBe('missed'); // a colleague scanned; not their mark
    expect(r.cells['2026-11-05'].s).toBe('off'); // leave
    expect(r.cells['2026-11-06'].s).toBe('off'); // holiday
    expect(r.cells['2026-11-07'].s).toBe('missed'); // today, nothing yet
    expect(r.cells['2026-11-08'].s).toBe('na'); // future (and a Sunday)
    expect(r).toMatchObject({ dutyDays: 4, markedDays: 2, missedDays: 2, markedPct: 50 });
  });

  it('a day nobody in the fleet marked is not a service day', () => {
    const r = buildMarkingReport(base({ marks: { person_days: [], route_days: [], fleet_days: ['2026-11-02'] } }))[0];
    expect(r.cells['2026-11-02'].s).toBe('missed');
    expect(r.cells['2026-11-03'].s).toBe('off');
  });

  it('does not double count a scanner found by both profile id and email', () => {
    const r = buildMarkingReport(base({
      marks: {
        person_days: [{ profile_id: 'p1', email: 'kumar@jkkn.ac.in', d: '2026-11-02', n: 5, first: null, last: null }],
        route_days: [],
        fleet_days: ['2026-11-02'],
      },
    }))[0];
    expect(r.cells['2026-11-02'].n).toBe(5);
  });

  it('summarizeDay counts statuses across in-charges', () => {
    const rows = buildMarkingReport(base({
      incharges: [ic(), ic({ assignmentId: 'a2', profileId: 'p2', emails: new Set(['b@x']), routeId: 'r2' })],
      marks: {
        person_days: [{ profile_id: 'p1', email: null, d: '2026-11-02', n: 5, first: null, last: null }],
        route_days: [{ route_id: 'r1', d: '2026-11-02', n: 5 }],
        fleet_days: ['2026-11-02'],
      },
    }));
    expect(summarizeDay(rows, '2026-11-02')).toEqual({ onDuty: 2, marked: 1, missed: 1 });
  });
});

describe('monthDays', () => {
  it('lists every date', () => {
    expect(monthDays('2026-02')).toHaveLength(28);
    expect(monthDays('2026-11')[29]).toBe('2026-11-30');
  });
});

describe('period summaries', () => {
  const cell = (s: any) => ({ s, n: 0, bus: 0, first: null, last: null });
  it('summarizeCells counts duty days only', () => {
    expect(summarizeCells([cell('marked'), cell('missed'), cell('missed'), cell('off'), cell('na')]))
      .toEqual({ duty: 3, marked: 1, missed: 2, pct: 33 });
    expect(summarizeCells([cell('off')]).pct).toBeNull();
  });
  it('toYearRows splits by month', () => {
    const rows = buildMarkingReport(base({
      marks: {
        person_days: [{ profile_id: 'p1', email: null, d: '2026-11-02', n: 3, first: null, last: null }],
        route_days: [],
        fleet_days: ['2026-11-02', '2026-11-03'],
      },
    }));
    const y = toYearRows(rows, ['2026-10', '2026-11'])[0];
    expect(y.months['2026-10'].pct).toBeNull();
    // 2 Nov marked, 3 Nov not, and today (7 Nov) not yet = Not marked.
    expect(y.months['2026-11']).toMatchObject({ duty: 3, marked: 1, pct: 33 });
    expect(y.total.pct).toBe(33);
  });
  it('bandCounts', () => {
    expect(bandCounts([0, 50, 80, 100, null])).toEqual({ people: 4, avg: 58, never: 1, low: 1, good: 2 });
  });
});
