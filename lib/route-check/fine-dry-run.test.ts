import { describe, it, expect } from 'vitest';
import { summariseFeeDryRun } from './fine-dry-run';
import type { LearnerFeeFactsRow } from './fee-facts';

const NOW = new Date('2026-09-24T04:00:00.000Z');
const ctx = { today: '2026-09-24', now: NOW };
const f = (o: Partial<LearnerFeeFactsRow>): LearnerFeeFactsRow => ({
  mark: 'unpaid', term1DueDate: '2026-08-31', runningNoticeExpiresAt: null, hasBill: true, ...o,
});

describe('summariseFeeDryRun', () => {
  it('uses the same rule as submit: only unpaid, past due, outside a running 48h window', () => {
    const facts = new Map<string, LearnerFeeFactsRow>([
      ['A', f({})],                                                         // would be fined
      ['B', f({ runningNoticeExpiresAt: '2026-09-25T13:51:00.000Z' })],     // inside 48h window
      ['C', f({ term1DueDate: '2026-09-30' })],                             // not yet due
      ['D', f({ mark: 'paid' })],
      ['E', f({ mark: 'override' })],
    ]);
    expect(summariseFeeDryRun(facts, new Set(), ctx)).toEqual({
      unpaidPastDue: 1, inNoticeWindow: 1, alreadyFinedThisYear: 0, unreadable: 0,
    });
  });

  it('does not count a learner who already holds this year\'s fine (any status) as fineable', () => {
    const facts = new Map([['A', f({})], ['B', f({})]]);
    expect(summariseFeeDryRun(facts, new Set(['A', 'Z']), ctx)).toEqual({
      unpaidPastDue: 1, inNoticeWindow: 0, alreadyFinedThisYear: 2, unreadable: 0,
    });
  });

  it('surfaces unreadable fee facts instead of silently reporting 0', () => {
    const facts = new Map([['A', f({ mark: 'unknown' })], ['B', f({ mark: 'unknown' })]]);
    expect(summariseFeeDryRun(facts, new Set(), ctx)).toMatchObject({ unpaidPastDue: 0, unreadable: 2 });
  });
});
