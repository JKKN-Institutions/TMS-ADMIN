import { describe, it, expect } from 'vitest';
import {
  groupRosterByStop, buildRosterRows, mergeAttendanceRoster,
  type RosterRider, type OrderedStop, type RosterRow, type RosterAttendance, type RosterViewer,
} from './roster';

/** The signed-in staff member most tests render for: an ordinary boarding staffer. */
const VIEWER: RosterViewer = { actorId: 'me', isOverrideHolder: false, isSuperAdmin: false };

/** An attendance row with the fields a test does not care about defaulted away. */
const attOf = (o: Partial<RosterAttendance> & { status: string }): RosterAttendance => ({
  method: null,
  scanned_at: null,
  scanned_by: null,
  marked_by_name: null,
  is_walk_up: false,
  previous_status: null,
  previous_by_name: null,
  previous_at: null,
  ...o,
});

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
    const att = new Map([['a', attOf({ status: 'present', method: 'qr_scan', scanned_at: '2026-07-11T02:00:00Z' })]]);
    const rows = buildRosterRows([r('a', '10', 's1')], route, stops, att, VIEWER);
    expect(rows[0].status).toBe('present');
    expect(rows[0].method).toBe('qr_scan');
    expect(rows[0].scanned_at).toBe('2026-07-11T02:00:00Z');
    expect(rows[0].route_number).toBe('05');
  });

  it('marks a rider absent (carrying method/time) when an absent row exists; no row → unmarked', () => {
    const att = new Map([['a', attOf({ status: 'absent', method: 'manual', scanned_at: 'x' })]]);
    const rows = buildRosterRows([r('a', '10', 's1'), r('b', '20', 's2')], route, stops, att, VIEWER);
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
    const rows = buildRosterRows([r('a', '30', 's2'), r('b', '10', 's1'), r('c', '20', 's1')], route, stops, new Map(), VIEWER);
    expect(rows.map((x) => x.learner_id)).toEqual(['b', 'c', 'a']); // s1(order1): roll10,20 ; then s2
    expect(rows[0].stop_name).toBe('First');
    expect(rows[0].stop_time).toBe('07:00');
  });

  it('buckets riders with null/unknown stops as "Stop not set" and trails them', () => {
    const rows = buildRosterRows([r('a', '10', null), r('b', '20', 's1'), r('c', '30', 'ghost')], route, stops, new Map(), VIEWER);
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
      route, stops, new Map(), VIEWER
    );
    expect(rows[0].booked).toBe(false);
    expect(rows[0].status).toBe('unmarked');
  });

  it('defaults booked to true when the rider carries no flag (booking-only callers)', () => {
    const rows = buildRosterRows(
      [{ learner_id: 'a', name: 'A', roll: '10', stop_id: 's1' }],
      route, stops, new Map(), VIEWER
    );
    expect(rows[0].booked).toBe(true);
  });

  it('still reports a real attendance mark on a rider without a ticket', () => {
    const att = new Map([['a', attOf({ status: 'present', method: 'manual', scanned_at: 't' })]]);
    const rows = buildRosterRows(
      [{ learner_id: 'a', name: 'A', roll: '10', stop_id: 's1', booked: false }],
      route, stops, att, VIEWER
    );
    expect(rows[0].status).toBe('present');
    expect(rows[0].booked).toBe(false);
  });
});

/**
 * `booked === false` and `is_walk_up === true` are NOT the same fact, and the
 * whole feature is the difference between them: the first says a student did
 * not book (~1,000 a day, most of whom stayed home), the second says an
 * in-charge watched them board anyway.
 */
describe('buildRosterRows — without-ticket travel', () => {
  const stops: OrderedStop[] = [{ id: 's1', name: 'First', time: '07:00', order: 1 }];
  const route = { id: 'r1', route_number: '05' };
  const unbooked = [{ learner_id: 'a', name: 'A', roll: '10', stop_id: 's1', booked: false }];

  it('does not infer is_walk_up from the absence of a booking', () => {
    const rows = buildRosterRows(unbooked, route, stops, new Map(), VIEWER);
    expect(rows[0].booked).toBe(false);
    expect(rows[0].is_walk_up).toBe(false);
  });

  it('reads is_walk_up from the stored mark', () => {
    const att = new Map([['a', attOf({ status: 'present', is_walk_up: true, scanned_by: 'me' })]]);
    const rows = buildRosterRows(unbooked, route, stops, att, VIEWER);
    expect(rows[0].is_walk_up).toBe(true);
    expect(rows[0].status).toBe('present');
  });

  // A booking made or cancelled AFTER the mark must not rewrite what the
  // in-charge recorded at the moment they saw the student board.
  it('keeps is_walk_up on a row that has since acquired a booking', () => {
    const att = new Map([['a', attOf({ status: 'present', is_walk_up: true, scanned_by: 'me' })]]);
    const rows = buildRosterRows(
      [{ learner_id: 'a', name: 'A', roll: '10', stop_id: 's1', booked: true }],
      route, stops, att, VIEWER,
    );
    expect(rows[0].booked).toBe(true);
    expect(rows[0].is_walk_up).toBe(true);
  });

  it('never reports is_walk_up on an unmarked row', () => {
    const rows = buildRosterRows(unbooked, route, stops, new Map(), VIEWER);
    expect(rows[0].is_walk_up).toBe(false);
  });

  // ── The arbitration SWITCH ──
  // A marked no-ticket row offers Undo (a delete), not a status flip, so it must
  // be gated by canClearMark. These two cases are precisely where the wrong
  // helper gives the wrong answer.
  it('lets the staffer who recorded a no-ticket boarding undo it', () => {
    const att = new Map([['a', attOf({ status: 'present', is_walk_up: true, scanned_by: 'me' })]]);
    const rows = buildRosterRows(unbooked, route, stops, att, VIEWER);
    expect(rows[0].can_edit).toBe(true);
  });

  it("refuses to let one staffer undo another's no-ticket record", () => {
    const att = new Map([['a', attOf({ status: 'present', is_walk_up: true, scanned_by: 'someone-else' })]]);
    const rows = buildRosterRows(unbooked, route, stops, att, VIEWER);
    expect(rows[0].can_edit).toBe(false);
    expect(rows[0].lock_reason).toBe('locked');
  });

  // decideMark would let an OWNER flip a colleague's status mark; canClearMark
  // deliberately does not extend that to deletion. Only the marker or the
  // transport office may erase a record the student has been notified about.
  it("refuses the owner too — deleting is narrower than overriding", () => {
    const att = new Map([['a', attOf({ status: 'present', is_walk_up: true, scanned_by: 'the-coverer' })]]);
    const rows = buildRosterRows(
      unbooked, route, stops, att, VIEWER,
      {
        ownerByLearner: new Map([['a', { staff_email: 'me@jkkn.ac.in', name: 'In-charge' }]]),
        mine: new Set(['me@jkkn.ac.in']),
        myEmail: 'me@jkkn.ac.in',
      },
    );
    expect(rows[0].can_edit).toBe(false);
  });

  it('lets the transport office clear anyone\'s no-ticket record', () => {
    const att = new Map([['a', attOf({ status: 'present', is_walk_up: true, scanned_by: 'someone-else' })]]);
    const rows = buildRosterRows(
      unbooked, route, stops, att,
      { actorId: 'me', isOverrideHolder: true, isSuperAdmin: false },
    );
    expect(rows[0].can_edit).toBe(true);
  });
});

/**
 * The two gates in series. Gate A (scope) asks whose JOB this learner is; Gate B
 * (arbitration) asks who owns this ROW. Neither subsumes the other, and the
 * roster's single can_edit flag has to fold both without the two disagreeing.
 */
describe('buildRosterRows — scope and arbitration compose', () => {
  const route = { id: 'r1', route_number: '05' };
  const OWNER = 'owner@jkkn.ac.in';
  const OTHER_IC = 'other@jkkn.ac.in';
  const only = (learnerId: string) => [{ learner_id: learnerId, name: 'A', roll: '10', stop_id: 's1' }];

  const ownedBy = (email: string, myEmail: string | null, mine: string[]) => ({
    ownerByLearner: new Map([['a', { staff_email: email, name: 'In-charge' }]]),
    mine: new Set(mine),
    myEmail,
  });

  it('leaves an unmarked row editable when no allocation exists at all', () => {
    const rows = buildRosterRows(only('a'), route, stops, new Map(), VIEWER);
    expect(rows[0].can_edit).toBe(true);
    expect(rows[0].lock_reason).toBeNull();
  });

  it("locks a colleague's mark when there is no allocation (arbitration alone)", () => {
    const att = new Map([['a', attOf({ status: 'present', scanned_by: 'someone-else' })]]);
    const rows = buildRosterRows(only('a'), route, stops, att, VIEWER);
    expect(rows[0].can_edit).toBe(false);
    expect(rows[0].lock_reason).toBe('locked');
  });

  // Scope is checked FIRST: naming the owner is more actionable than "locked",
  // and it says less about who marked what.
  it("reports not_my_share, not locked, for another in-charge's learner", () => {
    const att = new Map([['a', attOf({ status: 'present', scanned_by: 'someone-else' })]]);
    const rows = buildRosterRows(
      only('a'), route, stops, att, VIEWER, ownedBy(OTHER_IC, OWNER, [OWNER]),
    );
    expect(rows[0].lock_reason).toBe('not_my_share');
    expect(rows[0].owner_email).toBe(OTHER_IC);
  });

  // The fallback the whole design turns on: ~11% of the bus has no owner, and
  // those learners must stay markable by anyone on the route.
  it('leaves an UNOWNED learner editable by anyone on the route', () => {
    const rows = buildRosterRows(only('a'), route, stops, new Map(), VIEWER, {
      ownerByLearner: new Map(),
      mine: new Set([OWNER]),
      myEmail: OWNER,
    });
    expect(rows[0].can_edit).toBe(true);
    expect(rows[0].lock_reason).toBeNull();
    expect(rows[0].owner_email).toBeNull();
  });

  it("lets the owner replace a coverer's mark on their own learner", () => {
    const att = new Map([['a', attOf({ status: 'absent', scanned_by: 'the-coverer' })]]);
    const rows = buildRosterRows(
      only('a'), route, stops, att, VIEWER, ownedBy(OWNER, OWNER, [OWNER]),
    );
    expect(rows[0].can_edit).toBe(true);
  });

  // Same row, same marker — but the viewer is merely covering, not the owner.
  // Cover transfers duty, not authority over data already written.
  it("refuses a coverer replacing the owner's mark", () => {
    const att = new Map([['a', attOf({ status: 'absent', scanned_by: 'the-owner-profile' })]]);
    const rows = buildRosterRows(
      only('a'), route, stops, att, VIEWER,
      // In scope (OWNER's share is covered by me) but myEmail !== the owner.
      ownedBy(OWNER, 'coverer@jkkn.ac.in', [OWNER]),
    );
    expect(rows[0].can_edit).toBe(false);
    expect(rows[0].lock_reason).toBe('locked');
  });

  it('lets an override holder through the scope gate on any learner', () => {
    const rows = buildRosterRows(
      only('a'), route, stops, new Map(),
      { actorId: 'me', isOverrideHolder: true, isSuperAdmin: false },
      ownedBy(OTHER_IC, null, []),
    );
    expect(rows[0].can_edit).toBe(true);
  });

  // Holding no ticket used to short-circuit ahead of both gates, which is what
  // made an unticketed rider impossible to record at all. It is now no gate:
  // the row runs the ordinary scope check like any other.
  it('still applies the SCOPE gate to a rider with no ticket', () => {
    const rows = buildRosterRows(
      [{ learner_id: 'a', name: 'A', roll: '10', stop_id: 's1', booked: false }],
      route, stops, new Map(), VIEWER, ownedBy(OTHER_IC, OWNER, [OWNER]),
    );
    expect(rows[0].lock_reason).toBe('not_my_share');
    expect(rows[0].can_edit).toBe(false);
  });

  it('leaves an unmarked rider with no ticket editable when they are in scope', () => {
    const rows = buildRosterRows(
      [{ learner_id: 'a', name: 'A', roll: '10', stop_id: 's1', booked: false }],
      route, stops, new Map(), VIEWER, ownedBy(OWNER, OWNER, [OWNER]),
    );
    expect(rows[0].can_edit).toBe(true);
    expect(rows[0].lock_reason).toBeNull();
  });

  it('surfaces the replaced mark when one was overridden', () => {
    const att = new Map([['a', attOf({
      status: 'present', scanned_by: 'me', marked_by_name: 'Me',
      previous_status: 'absent', previous_by_name: 'Saranya G', previous_at: 't',
    })]]);
    const rows = buildRosterRows(only('a'), route, stops, att, VIEWER);
    expect(rows[0].previous_status).toBe('absent');
    expect(rows[0].previous_by_name).toBe('Saranya G');
    expect(rows[0].marked_by_name).toBe('Me');
  });
});
