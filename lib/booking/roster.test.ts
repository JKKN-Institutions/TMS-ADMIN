import { describe, it, expect } from 'vitest';
import {
  groupRosterByStop, buildRosterRows,
  type RosterRider, type OrderedStop, type RosterRow,
  type RosterAttendance, type RosterViewer,
} from './roster';

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

  const ME = 'staff-a';
  const OTHER = 'staff-b';
  const viewer: RosterViewer = { actorId: ME, isOverrideHolder: false, isSuperAdmin: false };

  // Full RosterAttendance with sensible defaults, so each test states only what it means.
  const att = (over: Partial<RosterAttendance> & { status: string }): RosterAttendance => ({
    method: 'manual',
    scanned_at: null,
    scanned_by: ME,
    marked_by_name: 'Saranya G',
    previous_status: null,
    previous_by_name: null,
    previous_at: null,
    ...over,
  });

  it('marks a rider present when an attendance row exists for the leg', () => {
    const map = new Map([
      ['a', att({ status: 'present', method: 'qr_scan', scanned_at: '2026-07-11T02:00:00Z' })],
    ]);
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, map, viewer);
    expect(rows[0].status).toBe('present');
    expect(rows[0].method).toBe('qr_scan');
    expect(rows[0].scanned_at).toBe('2026-07-11T02:00:00Z');
    expect(rows[0].route_number).toBe('05');
  });

  it('marks a rider absent (carrying method/time) when an absent row exists; no row → unmarked', () => {
    const map = new Map([['a', att({ status: 'absent', scanned_at: 'x' })]]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's2')], route, stops, map, viewer);
    const a = rows.find((x) => x.learner_id === 'a')!;
    const b = rows.find((x) => x.learner_id === 'b')!;
    expect(a.status).toBe('absent');
    expect(a.method).toBe('manual');
    expect(a.scanned_at).toBe('x');
    expect(b.status).toBe('unmarked');
    expect(b.method).toBeNull();
    expect(b.scanned_at).toBeNull();
  });

  it('resolves the leg-appropriate stop name + time and sorts by stop order then roll', () => {
    const rows = buildRosterRows(
      [r('a', '30', 's2'), r('b', '10', 's1'), r('c', '20', 's1')], route, stops, new Map(), viewer,
    );
    expect(rows.map((x) => x.learner_id)).toEqual(['b', 'c', 'a']);
    expect(rows[0].stop_name).toBe('First');
    expect(rows[0].stop_time).toBe('07:00');
  });

  it('buckets riders with null/unknown stops as "Stop not set" and trails them', () => {
    const rows = buildRosterRows(
      [r('a', '10', null), r('b', '20', 's1'), r('c', '30', 'ghost')], route, stops, new Map(), viewer,
    );
    expect(rows[0].learner_id).toBe('b');
    const trailing = rows.slice(1);
    expect(trailing.every((x) => x.stop_name === 'Stop not set' && x.stop_time === null)).toBe(true);
  });

  it('carries the marker id and name onto a marked row, and leaves them null when unmarked', () => {
    const map = new Map([['a', att({ status: 'present', marked_by_name: 'Saranya G' })]]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's1')], route, stops, map, viewer);
    const a = rows.find((x) => x.learner_id === 'a')!;
    const b = rows.find((x) => x.learner_id === 'b')!;
    expect(a.marked_by_id).toBe(ME);
    expect(a.marked_by_name).toBe('Saranya G');
    expect(b.marked_by_id).toBeNull();
    expect(b.marked_by_name).toBeNull();
  });

  it('leaves an unmarked row editable by anyone', () => {
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, new Map(), viewer);
    expect(rows[0].can_edit).toBe(true);
  });

  it('keeps my own mark editable but locks a colleague\'s', () => {
    const map = new Map([
      ['a', att({ status: 'present', scanned_by: ME })],
      ['b', att({ status: 'present', scanned_by: OTHER })],
    ]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's1')], route, stops, map, viewer);
    expect(rows.find((x) => x.learner_id === 'a')!.can_edit).toBe(true);
    expect(rows.find((x) => x.learner_id === 'b')!.can_edit).toBe(false);
  });

  it("unlocks a colleague's mark for an override holder and for a super admin", () => {
    const map = new Map([['b', att({ status: 'present', scanned_by: OTHER })]]);
    const head = buildRosterRows([r('b', '20', 's1')], route, stops, map,
      { actorId: ME, isOverrideHolder: true, isSuperAdmin: false });
    const su = buildRosterRows([r('b', '20', 's1')], route, stops, map,
      { actorId: ME, isOverrideHolder: false, isSuperAdmin: true });
    expect(head[0].can_edit).toBe(true);
    expect(su[0].can_edit).toBe(true);
  });

  it('treats an orphaned mark (marker profile deleted) as editable, not frozen', () => {
    const map = new Map([['a', att({ status: 'present', scanned_by: null, marked_by_name: null })]]);
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, map, viewer);
    expect(rows[0].can_edit).toBe(true);
    expect(rows[0].marked_by_name).toBeNull();
  });

  it('carries the override history onto a row that replaced an earlier mark', () => {
    const map = new Map([
      ['a', att({
        status: 'present',
        method: 'qr_scan',
        previous_status: 'absent',
        previous_by_name: 'Saranya G',
        previous_at: '2026-07-29T02:00:00Z',
      })],
    ]);
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, map, viewer);
    expect(rows[0].previous_status).toBe('absent');
    expect(rows[0].previous_by_name).toBe('Saranya G');
    expect(rows[0].previous_at).toBe('2026-07-29T02:00:00Z');
  });
});
