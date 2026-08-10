import { describe, it, expect } from 'vitest';
import { reminderTargets } from './reminder-targets';

describe('reminderTargets', () => {
  const learners = [
    { id: 'L1', profile_id: 'P1' },
    { id: 'L2', profile_id: 'P2' },
    { id: 'L3', profile_id: 'P3' },
    { id: 'L4', profile_id: null },
  ];

  it('drops learners who already booked, were already notified, or have no profile', () => {
    expect(
      reminderTargets(learners, new Set(['L1']), new Set(['P2']), null)
    ).toEqual(['P3']);
  });

  it('keeps only Term-1-paid learners when the paid set is known', () => {
    expect(
      reminderTargets(learners, new Set(), new Set(), new Set(['L1', 'L3']))
    ).toEqual(['P1', 'P3']);
  });

  it('falls OPEN and reminds everyone when the paid set is unknown', () => {
    // Mirrors the RPC: no current transport year means no Term-1 obligation to
    // evaluate, so nobody is filtered out on fee grounds.
    expect(
      reminderTargets(learners, new Set(), new Set(), null)
    ).toEqual(['P1', 'P2', 'P3']);
  });

  it('returns nothing when every learner is filtered out', () => {
    expect(
      reminderTargets(learners, new Set(['L1', 'L2', 'L3']), new Set(), null)
    ).toEqual([]);
  });
});
