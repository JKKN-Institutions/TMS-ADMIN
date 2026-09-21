import { describe, it, expect } from 'vitest';
import {
  classifyCell,
  buildCoverage,
  summarizeCoverage,
  DEFAULT_COVERAGE_THRESHOLD,
  type RawRouteCoverage,
} from './coverage';

describe('classifyCell', () => {
  const base = { roster: 100, threshold: 0.6, isHoliday: false };

  it('a holiday wins over every count', () => {
    expect(classifyCell({ ...base, human: 90, auto: 0, isHoliday: true })).toBe('holiday');
    expect(classifyCell({ ...base, human: 0, auto: 0, isHoliday: true })).toBe('holiday');
  });

  it('no marks at all is not_marked', () => {
    expect(classifyCell({ ...base, human: 0, auto: 0 })).toBe('not_marked');
  });

  it('auto marks with no human mark is auto_only, never marked', () => {
    expect(classifyCell({ ...base, human: 0, auto: 80 })).toBe('auto_only');
  });

  it('at exactly the threshold the cell is marked', () => {
    expect(classifyCell({ ...base, human: 60, auto: 0 })).toBe('marked');
  });

  it('one below the threshold is partial', () => {
    expect(classifyCell({ ...base, human: 59, auto: 0 })).toBe('partial');
  });

  it('a route with no allocated learners can never be partial', () => {
    expect(classifyCell({ ...base, roster: 0, human: 1, auto: 0 })).toBe('marked');
    expect(classifyCell({ ...base, roster: 0, human: 0, auto: 0 })).toBe('not_marked');
  });

  it('auto marks never rescue a partial cell into marked', () => {
    expect(classifyCell({ ...base, human: 10, auto: 90 })).toBe('partial');
  });
});

const raw = (over: Partial<RawRouteCoverage> = {}): RawRouteCoverage => ({
  route_id: 'r1',
  route_number: '07',
  route_name: 'POOLAMPATTI',
  roster: 10,
  days: [
    { d: '2026-09-01', h: 10, a: 0, x: false },
    { d: '2026-09-02', h: 0, a: 0, x: false },
  ],
  ...over,
});

describe('buildCoverage', () => {
  it('produces the column dates from the first route, in order', () => {
    const { dates } = buildCoverage([raw()], DEFAULT_COVERAGE_THRESHOLD);
    expect(dates).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('counts humanDays and serviceDays, excluding holidays from serviceDays', () => {
    const rows = [
      raw({
        days: [
          { d: '2026-09-01', h: 10, a: 0, x: false },
          { d: '2026-09-02', h: 0, a: 0, x: false },
          { d: '2026-09-03', h: 0, a: 0, x: true },
        ],
      }),
    ];
    const { routes } = buildCoverage(rows, DEFAULT_COVERAGE_THRESHOLD);
    expect(routes[0].humanDays).toBe(1);
    expect(routes[0].serviceDays).toBe(2);
  });

  it('returns empty dates for an empty result rather than throwing', () => {
    expect(buildCoverage([], DEFAULT_COVERAGE_THRESHOLD)).toEqual({ routes: [], dates: [] });
  });
});

describe('summarizeCoverage', () => {
  it('names routes with zero human marks and totals their learners', () => {
    const rows = [
      raw({ route_id: 'a', route_number: '10', roster: 33, days: [{ d: '2026-09-01', h: 0, a: 0, x: false }] }),
      raw({ route_id: 'b', route_number: '37', roster: 98, days: [{ d: '2026-09-01', h: 0, a: 0, x: false }] }),
      raw({ route_id: 'c', route_number: '07', roster: 70, days: [{ d: '2026-09-01', h: 70, a: 0, x: false }] }),
    ];
    const { routes } = buildCoverage(rows, DEFAULT_COVERAGE_THRESHOLD);
    const s = summarizeCoverage(routes);
    expect(s.neverMarkedRoutes.map((r) => r.routeNumber)).toEqual(['10', '37']);
    expect(s.neverMarkedLearners).toBe(131);
    expect(s.unmarkedRouteDays).toBe(2);
  });

  it('does not count holiday cells as unmarked route-days', () => {
    const rows = [raw({ roster: 5, days: [{ d: '2026-09-01', h: 0, a: 0, x: true }] })];
    const { routes } = buildCoverage(rows, DEFAULT_COVERAGE_THRESHOLD);
    expect(summarizeCoverage(routes).unmarkedRouteDays).toBe(0);
  });

  it('counts auto-only route-days separately from unmarked ones', () => {
    const rows = [raw({ roster: 5, days: [{ d: '2026-09-01', h: 0, a: 5, x: false }] })];
    const { routes } = buildCoverage(rows, DEFAULT_COVERAGE_THRESHOLD);
    const s = summarizeCoverage(routes);
    expect(s.autoOnlyRouteDays).toBe(1);
    expect(s.unmarkedRouteDays).toBe(0);
  });
});
