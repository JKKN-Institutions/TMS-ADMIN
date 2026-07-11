import { describe, it, expect } from 'vitest';
import { groupRosterByStop, buildRosterRows, type RosterRider, type OrderedStop, type RosterRow } from './roster';

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

  it('leaves a rider unmarked (null method/time) when no present row exists', () => {
    const att = new Map([['a', { status: 'absent', method: 'manual', scanned_at: 'x' }]]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's2')], route, stops, att);
    const a = rows.find((x) => x.learner_id === 'a')!;
    const b = rows.find((x) => x.learner_id === 'b')!;
    expect(a.status).toBe('unmarked'); // 'absent' counts as unmarked in the two-state model
    expect(a.method).toBeNull();
    expect(b.status).toBe('unmarked');
    expect(b.method).toBeNull();
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
