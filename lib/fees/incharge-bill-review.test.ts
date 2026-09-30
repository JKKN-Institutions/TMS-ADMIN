import { describe, it, expect } from 'vitest';
import {
  parseReviewConfig, validateReviewConfig, toStoredReviewConfig, DEFAULT_REVIEW_CONFIG,
  isMonth, monthBounds, previousMonth, monthLabel, effectiveMode,
  serviceDaysForRoute, evaluatePerson, indexRouteDays, normEmail, staffEmails,
  matchAssignments, personalDatesFor, sumAmounts, istDateOf,
  type ServiceDayInputs, type ReviewMarks,
} from './incharge-bill-review';

describe('config', () => {
  it('fails OFF when missing or unreadable', () => {
    expect(parseReviewConfig(undefined)).toEqual(DEFAULT_REVIEW_CONFIG);
    expect(parseReviewConfig('x')).toEqual({ mode: 'off', minPersonalPct: 75, minRequiredDays: 10 });
    expect(parseReviewConfig({ mode: 'bogus' }).mode).toBe('off');
  });
  it('reads stored snake_case keys and falls back per key when out of range', () => {
    expect(parseReviewConfig({ mode: 'auto', min_personal_pct: 80, min_required_days: 12 }))
      .toEqual({ mode: 'auto', minPersonalPct: 80, minRequiredDays: 12 });
    expect(parseReviewConfig({ mode: 'preview', min_personal_pct: 150, min_required_days: 0 }))
      .toEqual({ mode: 'preview', minPersonalPct: 75, minRequiredDays: 10 });
  });
  it('round-trips through the stored shape', () => {
    const c = { mode: 'auto' as const, minPersonalPct: 70, minRequiredDays: 8 };
    expect(parseReviewConfig(toStoredReviewConfig(c))).toEqual(c);
  });
  it('validates input', () => {
    expect(validateReviewConfig({ mode: 'auto', minPersonalPct: 75, minRequiredDays: 10 })).toBeNull();
    expect(validateReviewConfig({ mode: 'on', minPersonalPct: 75, minRequiredDays: 10 })).toMatch(/mode/i);
    expect(validateReviewConfig({ mode: 'auto', minPersonalPct: 0, minRequiredDays: 10 })).toMatch(/1 and 100/);
    expect(validateReviewConfig({ mode: 'auto', minPersonalPct: 75, minRequiredDays: 27 })).toMatch(/1 and 26/);
  });
});

describe('months', () => {
  it('validates, bounds and steps back', () => {
    expect(isMonth('2026-09')).toBe(true);
    expect(isMonth('2026-9')).toBe(false);
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthBounds('2028-02').last).toBe('2028-02-29');
    expect(previousMonth('2026-10-01')).toBe('2026-09');
    expect(previousMonth('2026-01-15')).toBe('2025-12');
    expect(monthLabel('2026-09')).toBe('September 2026');
  });
});

describe('effectiveMode', () => {
  it('skips when off unless preview is forced', () => {
    expect(effectiveMode('off', false, true)).toBeNull();
    expect(effectiveMode('off', true, true)).toBe('preview');
  });
  it('never applies a month that has not ended', () => {
    expect(effectiveMode('auto', false, false)).toBe('preview');
    expect(effectiveMode('auto', false, true)).toBe('auto');
    expect(effectiveMode('auto', true, true)).toBe('preview');
    expect(effectiveMode('preview', false, true)).toBe('preview');
  });
});

describe('serviceDaysForRoute', () => {
  // Mon 14 .. Sun 20 Sep 2026
  const inp: ServiceDayInputs = {
    from: '2026-09-14', to: '2026-09-20',
    calendarOff: [{ date: '2026-09-15', routeId: null }, { date: '2026-09-16', routeId: 'r2' }],
    excused: ['2026-09-17'],
    fleetDays: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-20'],
  };
  it('drops Sundays, all-route holidays, excused and fleet-dark days', () => {
    expect(serviceDaysForRoute(inp, 'r1')).toEqual(['2026-09-14', '2026-09-16', '2026-09-18']);
  });
  it('applies a route-specific holiday only to that route', () => {
    expect(serviceDaysForRoute(inp, 'r2')).toEqual(['2026-09-14', '2026-09-18']);
  });
});

// Tue 1 .. Sat 12 Sep 2026; Sunday 6 excluded → 11 service days.
const ALL = ['01', '02', '03', '04', '05', '07', '08', '09', '10', '11', '12'].map((d) => `2026-09-${d}`);
const DAYS: ServiceDayInputs = { from: '2026-09-01', to: '2026-09-12', calendarOff: [], excused: [], fleetDays: ALL };
const CFG = { minPersonalPct: 75, minRequiredDays: 10 };
const routes = (m: Record<string, string[]>) => new Map(Object.entries(m).map(([k, v]) => [k, new Set(v)]));

describe('evaluatePerson', () => {
  it('passes when the bus is marked every day and own share is met', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-08-20' }],
      personalDates: new Set(ALL.slice(0, 9)),
      routeDates: routes({ r1: ALL }),
      days: DAYS, config: CFG,
    });
    expect(v).toMatchObject({ outcome: 'passed', requiredDays: 11, routeDays: 11, personalDays: 9, personalPct: 81.8, missedRouteDates: [] });
  });
  it('fails on a single unmarked bus day and lists it', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-08-20' }],
      personalDates: new Set(ALL),
      routeDates: routes({ r1: ALL.filter((d) => d !== '2026-09-08') }),
      days: DAYS, config: CFG,
    });
    expect(v.outcome).toBe('failed');
    expect(v.routeDays).toBe(10);
    expect(v.missedRouteDates).toEqual(['2026-09-08']);
    expect(v.reason).toMatch(/not marked on 1 day/);
  });
  it('passes at exactly the personal threshold and fails just under', () => {
    const cfg = { minPersonalPct: 75, minRequiredDays: 5 };
    const eight = ALL.slice(3); // start 4 Sep → 8 required days
    const base = { assignments: [{ routeId: 'r1', startDate: '2026-09-04' }], routeDates: routes({ r1: ALL }), days: DAYS, config: cfg };
    expect(evaluatePerson({ ...base, personalDates: new Set(eight.slice(0, 6)) }).outcome).toBe('passed');
    expect(evaluatePerson({ ...base, personalDates: new Set(eight.slice(0, 5)) }).outcome).toBe('failed');
  });
  it('counts only days from the assignment start', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-09-05' }],
      personalDates: new Set(ALL), routeDates: routes({ r1: ALL }), days: DAYS, config: CFG,
    });
    expect(v.outcome).toBe('not_enough_days');
    expect(v.requiredDays).toBe(7);
    const w = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-09-05' }],
      personalDates: new Set(ALL), routeDates: routes({ r1: ALL }), days: DAYS, config: { ...CFG, minRequiredDays: 7 },
    });
    expect(w.outcome).toBe('passed');
  });
  it('requires every assigned route to be perfect', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-08-01' }, { routeId: 'r2', startDate: '2026-08-01' }],
      personalDates: new Set(ALL),
      routeDates: routes({ r1: ALL, r2: ALL.filter((d) => d !== '2026-09-02') }),
      days: DAYS, config: CFG,
    });
    expect(v.outcome).toBe('failed');
    expect(v.missedRouteDates).toEqual(['2026-09-02']);
  });
  it('ignores personal marks on non-service days', () => {
    const v = evaluatePerson({
      assignments: [{ routeId: 'r1', startDate: '2026-08-01' }],
      personalDates: new Set(['2026-09-06', ...ALL.slice(0, 8)]),
      routeDates: routes({ r1: ALL }), days: DAYS, config: CFG,
    });
    expect(v.personalDays).toBe(8);
    expect(v.outcome).toBe('failed'); // 8/11 = 72.7%
  });
});

describe('identity', () => {
  it('normalises emails', () => {
    expect(normEmail('  A@X.com ')).toBe('a@x.com');
    expect(normEmail('   ')).toBeNull();
    expect(normEmail(null)).toBeNull();
  });
  it('collects all three addresses', () => {
    expect([...staffEmails({ email: 'A@x.com ', institution_email: null }, 'a.inst@X.com')].sort())
      .toEqual(['a.inst@x.com', 'a@x.com']);
  });
  it('matches an assignment typed with any address, dated in IST, earliest start per route', () => {
    const emails = staffEmails({ email: 'a@x.com', institution_email: 'a.inst@x.com' }, null);
    const got = matchAssignments(emails, [
      { staff_email: 'A.Inst@x.com ', route_id: 'r1', assigned_at: '2026-08-31T20:00:00Z', created_at: null },
      { staff_email: 'someone@x.com', route_id: 'r9', assigned_at: '2026-08-01T00:00:00Z', created_at: null },
      { staff_email: 'a@x.com', route_id: 'r1', assigned_at: null, created_at: '2026-09-10T04:00:00Z' },
    ], '2026-09-30');
    expect(got).toEqual([{ routeId: 'r1', startDate: '2026-09-01' }]);
  });
  it('drops assignments that started after the month ended', () => {
    const emails = new Set(['a@x.com']);
    expect(matchAssignments(emails, [
      { staff_email: 'a@x.com', route_id: 'r1', assigned_at: '2026-10-02T04:00:00Z', created_at: null },
    ], '2026-09-30')).toEqual([]);
  });
  it('finds personal days by profile id or by any known email', () => {
    const m: ReviewMarks = {
      route_days: [], fleet_days: [],
      person_days: [
        { profile_id: 'p1', email: null, d: '2026-09-01' },
        { profile_id: 'p9', email: 'a@x.com', d: '2026-09-02' },
        { profile_id: 'p7', email: 'b@x.com', d: '2026-09-03' },
      ],
    };
    expect([...personalDatesFor(m, 'p1', new Set(['a@x.com']))].sort()).toEqual(['2026-09-01', '2026-09-02']);
  });
});

describe('helpers', () => {
  it('indexes route days', () => {
    const idx = indexRouteDays({ route_days: [{ route_id: 'r1', d: '2026-09-01' }, { route_id: 'r1', d: '2026-09-02' }], person_days: [], fleet_days: [] });
    expect([...(idx.get('r1') ?? [])]).toEqual(['2026-09-01', '2026-09-02']);
  });
  it('sums numeric strings as numbers', () => {
    expect(sumAmounts([{ amount: '12900.00' }, { amount: 5500 }, { amount: null }])).toBe(18400);
  });
  it('converts an instant to its IST date', () => {
    expect(istDateOf('2026-08-31T20:00:00Z')).toBe('2026-09-01');
  });
});
