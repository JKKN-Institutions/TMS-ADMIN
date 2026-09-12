import { describe, expect, it } from 'vitest';
import { syncMessages } from './messages';
import type { SyncOutcome } from './sync';

const entry = (name: string, status: 'present' | 'absent' = 'present') => ({
  kind: 'mark' as const, direction: 'onward' as const, clientId: name, userId: 'u', learnerId: name, routeId: 'r', status, name,
  tappedAt: '', tripDate: '', attempts: 0, nextAttemptAt: 0,
});
const o = (name: string, result: SyncOutcome['result'], status: 'present' | 'absent' = 'present'): SyncOutcome =>
  ({ entry: entry(name, status), result });

describe('syncMessages', () => {
  it('says nothing when nothing was sent', () => {
    expect(syncMessages([])).toEqual([]);
  });

  it('gives one line per mark for a few marks', () => {
    expect(syncMessages([
      o('Priya', { clientId: 'x', outcome: 'inserted', walkUp: false }, 'absent'),
      o('Ravi', { clientId: 'x', outcome: 'inserted', walkUp: true }),
      o('Anu', { clientId: 'x', outcome: 'locked', markedByName: 'Kavya' }),
    ])).toEqual([
      { kind: 'success', text: 'Marked Priya absent.' },
      { kind: 'success', text: 'Ravi recorded as travelling without a ticket. They have been notified.' },
      { kind: 'warning', text: 'Anu: not saved — already marked by Kavya.' },
    ]);
  });

  it('summarises a backlog in one line', () => {
    const many = ['a', 'b', 'c', 'd'].map((n) => o(n, { clientId: n, outcome: 'inserted', walkUp: false }));
    many.push(o('e', { clientId: 'e', outcome: 'rejected', reason: 'stale' }));
    expect(syncMessages(many)).toEqual([
      { kind: 'warning', text: 'Sent 4 saved marks. 1 not saved — see "Not saved" on this page.' },
    ]);
  });
});
