import { describe, it, expect } from 'vitest';
import { parseReportParams, daysBetween, MAX_RANGE_DAYS, MAX_PAGE } from './params';

const TODAY = '2026-09-18';
const ID = '87217217-1cea-408b-a786-941778bf54ef';
const ID2 = '5de4fba1-4564-41ed-8c73-5d948b74b843';

function parse(qs: string) {
  return parseReportParams(new URLSearchParams(qs), TODAY);
}
function ok(qs: string) {
  const r = parse(qs);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.params;
}
function err(qs: string) {
  const r = parse(qs);
  if (r.ok) throw new Error('expected an error');
  return r.error;
}

describe('parseReportParams', () => {
  it('defaults to today, one day, morning trip, first page', () => {
    expect(ok('')).toMatchObject({
      from: TODAY, to: TODAY, direction: 'onward', group: 'institution',
      routeIds: null, institutionIds: null, departmentIds: null,
      booked: null, attendance: null, fee: null, limit: 100, offset: 0, format: 'json',
    });
  });

  it('defaults `to` to `from`, so one date means one day', () => {
    expect(ok('from=2026-09-01')).toMatchObject({ from: '2026-09-01', to: '2026-09-01' });
  });

  it('takes id lists, and drops repeats', () => {
    expect(ok(`route_id=${ID},${ID},${ID2}`).routeIds).toEqual([ID, ID2]);
    expect(ok(`institution_id=${ID2}`).institutionIds).toEqual([ID2]);
  });

  it('refuses an id list that is not ids', () => {
    expect(err('route_id=49')).toMatch(/route_id/);
  });

  it('refuses an unknown filter value rather than ignoring it', () => {
    expect(err('fee=owing')).toMatch(/paid, unpaid, none/);
    expect(err('attendance=here')).toMatch(/present, absent, unmarked/);
    expect(err('booked=maybe')).toMatch(/yes, no/);
    expect(err('direction=evening')).toMatch(/onward, return/);
    expect(err('group=programme')).toMatch(/institution, department/);
    expect(err('format=pdf')).toMatch(/json, xlsx/);
  });

  it('refuses bad or backwards dates', () => {
    expect(err('from=18-09-2026')).toMatch(/YYYY-MM-DD/);
    expect(err('from=2026-13-45')).toMatch(/real dates/);
    expect(err('from=2026-09-18&to=2026-09-01')).toMatch(/before from/);
  });

  it('caps the range and says how long was asked for', () => {
    const e = err('from=2026-01-01&to=2026-12-31');
    expect(e).toMatch(new RegExp(`${MAX_RANGE_DAYS} days or fewer`));
    expect(e).toMatch(/365/);
  });

  it('allows a range exactly at the cap', () => {
    const to = new Date(Date.parse('2026-01-01T00:00:00Z') + (MAX_RANGE_DAYS - 1) * 86_400_000)
      .toISOString().slice(0, 10);
    expect(ok(`from=2026-01-01&to=${to}`).to).toBe(to);
  });

  it('clamps page size and floors a silly offset', () => {
    expect(ok('limit=99999').limit).toBe(MAX_PAGE);
    expect(ok('limit=0').limit).toBe(1);
    expect(ok('limit=abc').limit).toBe(100);
    expect(ok('offset=-5').offset).toBe(0);
  });

  it('counts days inclusively', () => {
    expect(daysBetween('2026-09-18', '2026-09-18')).toBe(1);
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(30);
  });
});
