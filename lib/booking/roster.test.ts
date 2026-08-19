import { describe, it, expect } from 'vitest';
import { groupRosterByStop, buildRosterRows, mergeAttendanceRoster, type RosterRider, type OrderedStop, type RosterRow } from './roster';

const stops: OrderedStop[] = [
  { id: 's2', name: 'Second', time: '07:20', order: 2 },
  { id: 's1', name: 'First', time: '07:00', order: 1 },
];
const rider = (learner_id: string, roll: string | null, stop_id: string | null, name = 'X'): RosterRider =>
  ({ learner_id, roll, stop_id, name });

describe('groupRosterByStop', () => {
  it('orders groups by stop sequence, not input order', () => {
    const groups = groupRosterByStop([rider('a', '10', 's2'), rider('b', '20', 's1')], stops);
    expect(groups.map((g) => g.stop_id)).toEqual(['s1', 's2']);
  });

  it('skips stops that have no riders', () => {
    const groups = groupRosterByStop([rider('a', '10', 's1')], stops);
    expect(groups.map((g) => g.stop_id)).toEqual(['s1']);
  });

  it('places the "Stop not set" bucket last for null/unknown stop ids', () => {
    const groups = groupRosterByStop(
      [rider('a', '10', 's1'), rider('b', '20', null), rider('c', '30', 'ghost')],
      stops
    );
    expect(groups.map((g) => g.stop_id)).toEqual(['s1', null]);
    const last = groups[groups.length - 1];
    expect(last.stop_name).toBe('Stop not set');
    expect(last.count).toBe(2);
  });

  it('sorts riders within a stop by roll then name (numeric-aware)', () => {
    const groups = groupRosterByStop(
      [rider('a', '100', 's1', 'Zoe'), rider('b', '20', 's1', 'Ann'), rider('c', null, 's1', 'Bob')],
      stops
    );
    expect(groups[0].riders.map((r) => r.learner_id)).toEqual(['b', 'a', 'c']);
  });

  it('returns an empty array for empty input', () => {
    expect(groupRosterByStop([], stops)).toEqual([]);
  });
});

describe('buildRosterRows', () => {
  const stops: OrderedStop[] = [
    { id: 's2', name: 'Second', time: '07:20', order: 2 },
    { id: 's1', name: 'First', time: '07:00', order: 1 },
  ];
  const route = { id: 'r1', route_number: '05' };
  const r = (learner_id: string, roll: string | null, stop_id: string | null, name = 'X'): RosterRider =>
    ({ learner_id, roll, stop_id, name });

  it('marks a rider present when an attendance row exists for the leg', () => {
    const att = new Map([['a', { status: 'present', method: 'qr_scan', scanned_at: '2026-07-11T02:00:00Z' }]]);
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, att);
    expect(rows[0].status).toBe('present');
    expect(rows[0].method).toBe('qr_scan');
    expect(rows[0].scanned_at).toBe('2026-07-11T02:00:00Z');
    expect(rows[0].route_number).toBe('05');
  });

  it('marks a rider absent (carrying method/time) when an absent row exists; no row → unmarked', () => {
    const att = new Map([['a', { status: 'absent', method: 'manual', scanned_at: 'x' }]]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's2')], route, stops, att);
    const a = rows.find((x) => x.learner_id === 'a')!;
    const b = rows.find((x) => x.learner_id === 'b')!;
    expect(a.status).toBe('absent'); // three-state model: 'absent' is a first-class status
    expect(a.method).toBe('manual');
    expect(a.scanned_at).toBe('x');
    expect(b.status).toBe('unmarked'); // no attendance row at all
    expect(b.method).toBeNull();
    expect(b.scanned_at).toBeNull();
  });

  it('resolves the leg-appropriate stop name + time and sorts by stop order then roll', () => {
    const rows = buildRosterRows([r('a', '30', 's2'), r('b', '10', 's1'), r('c', '20', 's1')], route, stops, new Map());
    expect(rows.map((x) => x.learner_id)).toEqual(['b', 'c', 'a']); // s1(order1): roll10,20 ; then s2
    expect(rows[0].stop_name).toBe('First');
    expect(rows[0].stop_time).toBe('07:00');
  });

  it('buckets riders with null/unknown stops as "Stop not set" and trails them', () => {
    const rows = buildRosterRows([r('a', '10', null), r('b', '20', 's1'), r('c', '30', 'ghost')], route, stops, new Map());
    expect(rows[0].learner_id).toBe('b');
    const trailing = rows.slice(1);
    expect(trailing.every((x) => x.stop_name === 'Stop not set' && x.stop_time === null)).toBe(true);
  });
});

describe('mergeAttendanceRoster', () => {
  const alloc = (learner_id: string, roll: string | null, stop_id: string | null, name = 'X'): RosterRider =>
    ({ learner_id, roll, stop_id, name });

  it('flags allocated riders with no booking as booked:false', () => {
    const merged = mergeAttendanceRoster([alloc('a', '10', 's1')], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].booked).toBe(false);
  });

  it('flags an allocated rider who booked as booked:true', () => {
    const merged = mergeAttendanceRoster([alloc('a', '10', 's1')], [alloc('a', '10', 's1')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].booked).toBe(true);
  });

  it("prefers the day's BOOKED stop over the profile's allocated stop", () => {
    const merged = mergeAttendanceRoster([alloc('a', '10', 's1')], [alloc('a', '10', 's2')]);
    expect(merged[0].stop_id).toBe('s2');
  });

  it('keeps a booked rider who is NOT allocated to this route (never drops a booking)', () => {
    const merged = mergeAttendanceRoster([alloc('a', '10', 's1')], [alloc('z', '99', 's2', 'Zed')]);
    expect(merged.map((m) => m.learner_id).sort()).toEqual(['a', 'z']);
    expect(merged.find((m) => m.learner_id === 'z')!.booked).toBe(true);
  });

  it('falls back to the allocated stop when the booking carries no stop', () => {
    const merged = mergeAttendanceRoster([alloc('a', '10', 's1')], [alloc('a', '10', null)]);
    expect(merged[0].stop_id).toBe('s1');
    expect(merged[0].booked).toBe(true);
  });

  it('keeps the allocated name/roll when the booking row has none', () => {
    const merged = mergeAttendanceRoster([alloc('a', '10', 's1', 'Ann')], [{ learner_id: 'a', name: 'Learner', roll: null, stop_id: 's1' }]);
    expect(merged[0].name).toBe('Ann');
    expect(merged[0].roll).toBe('10');
  });
});

describe('buildRosterRows — ticket state', () => {
  const stops: OrderedStop[] = [{ id: 's1', name: 'First', time: '07:00', order: 1 }];
  const route = { id: 'r1', route_number: '05' };

  it('carries booked:false through to the row', () => {
    const rows = buildRosterRows(
      [{ learner_id: 'a', name: 'A', roll: '10', stop_id: 's1', booked: false }],
      route, stops, new Map()
    );
    expect(rows[0].booked).toBe(false);
    expect(rows[0].status).toBe('unmarked');
  });

  it('defaults booked to true when the rider carries no flag (booking-only callers)', () => {
    const rows = buildRosterRows(
      [{ learner_id: 'a', name: 'A', roll: '10', stop_id: 's1' }],
      route, stops, new Map()
    );
    expect(rows[0].booked).toBe(true);
  });

  it('still reports a real attendance mark on a rider without a ticket', () => {
    const att = new Map([['a', { status: 'present', method: 'manual', scanned_at: 't' }]]);
    const rows = buildRosterRows(
      [{ learner_id: 'a', name: 'A', roll: '10', stop_id: 's1', booked: false }],
      route, stops, att
    );
    expect(rows[0].status).toBe('present');
    expect(rows[0].booked).toBe(false);
  });
});
