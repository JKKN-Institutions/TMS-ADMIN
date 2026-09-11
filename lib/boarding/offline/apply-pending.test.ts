import { describe, expect, it } from 'vitest';
import type { RosterRow } from '@/lib/booking/roster';
import type { OutboxEntry } from './outbox';
import { applyPending, countRoster, pendingByLearner } from './apply-pending';

const row = (id: string, over: Partial<RosterRow> = {}): RosterRow => ({
  learner_id: id, name: id, roll: null, route_id: 'r1', route_number: '12', stop_id: null,
  stop_name: 'S', stop_time: null, status: 'unmarked', method: null, scanned_at: null,
  booked: true, is_walk_up: false, owner_email: null, owner_name: null, is_mine: true,
  marked_by_name: null, can_edit: true, can_clear: false, lock_reason: null,
  previous_status: null, previous_by_name: null, previous_at: null, ...over,
});

const roster = (rows: RosterRow[]) => ({ date: '2026-09-11', rows, ...countRoster(rows) });

const base = { userId: 'u1', tappedAt: '2026-09-11T03:00:00Z', tripDate: '2026-09-11', direction: 'onward' as const, attempts: 0, nextAttemptAt: 0, name: null };

describe('pendingByLearner', () => {
  it('maps marks and scans for the viewed day and trip only', () => {
    const entries: OutboxEntry[] = [
      { ...base, kind: 'mark', clientId: 'a', learnerId: 'l1', routeId: 'r1', status: 'absent' },
      { ...base, kind: 'scan', clientId: 'b', learnerId: 'l2', token: 't', walkUp: false, verified: false },
      { ...base, kind: 'scan', clientId: 'c', learnerId: null, token: 'x', walkUp: false, verified: false },
      { ...base, kind: 'mark', clientId: 'd', learnerId: 'l3', routeId: 'r1', status: 'present', tripDate: '2026-09-10' },
      { ...base, kind: 'mark', clientId: 'e', learnerId: 'l4', routeId: 'r1', status: 'present', direction: 'return' },
    ];
    const p = pendingByLearner(entries, '2026-09-11', 'onward');
    expect([...p.entries()]).toEqual([
      ['l1', { status: 'absent', kind: 'queued' }],
      ['l2', { status: 'present', kind: 'unverified' }],
    ]);
  });
});

describe('applyPending', () => {
  it('returns the same roster when nothing is pending', () => {
    const r = roster([row('l1')]);
    expect(applyPending(r, new Map())).toBe(r);
  });

  it('overlays status and recounts the tiles exactly as the server does', () => {
    const r = roster([
      row('l1'),
      row('l2', { booked: false }),
      row('l3', { status: 'present' }),
      row('l4', { is_mine: false }),
    ]);
    const out = applyPending(r, new Map([
      ['l1', { status: 'absent', kind: 'queued' }],
      ['l2', { status: 'present', kind: 'queued' }],
    ]));
    expect(out.rows.find((x) => x.learner_id === 'l2')).toMatchObject({ status: 'present', is_walk_up: true });
    expect(out.counts).toEqual({
      total: 4, present: 2, absent: 1, unmarked: 1, booked: 3, withoutTicket: 1, boardedWithoutTicket: 1,
    });
    // share = is_mine && booked: l1, l3 (l2 unbooked, l4 not mine)
    expect(out.share).toEqual({ total: 2, marked: 2, remaining: 0 });
  });

  it('clears the walk-up flag when an unbooked rider is re-marked absent', () => {
    const r = roster([row('l1', { booked: false, status: 'present', is_walk_up: true })]);
    const out = applyPending(r, new Map([['l1', { status: 'absent', kind: 'queued' }]]));
    expect(out.rows[0]).toMatchObject({ status: 'absent', is_walk_up: false });
  });
});
