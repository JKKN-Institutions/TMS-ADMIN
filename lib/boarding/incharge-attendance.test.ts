import { describe, it, expect } from 'vitest';
import {
  evaluateDay,
  warningCopy,
  removalCopy,
  performRemoval,
  REMOVAL_THRESHOLD,
  type StrikeState,
} from './incharge-attendance';

const fresh: StrikeState = { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: null };
const travelDay = { date: '2026-07-20', hasBookedRiders: true, attendanceMarked: false, assignedOnDate: false };

describe('evaluateDay', () => {
  it('skips a day already evaluated (idempotent re-fire)', () => {
    const prev = { ...fresh, lastEvaluatedDate: '2026-07-20' };
    expect(evaluateDay(prev, travelDay)).toEqual({ action: 'skip', reason: 'already_evaluated' });
  });

  it('skips the assignment grace day', () => {
    expect(evaluateDay(fresh, { ...travelDay, assignedOnDate: true }))
      .toEqual({ action: 'skip', reason: 'grace_day' });
  });

  it('skips a day with no booked riders (holiday / empty roster)', () => {
    expect(evaluateDay(fresh, { ...travelDay, hasBookedRiders: false }))
      .toEqual({ action: 'skip', reason: 'no_travel_day' });
  });

  it('already-evaluated takes precedence over the grace day', () => {
    const prev = { ...fresh, lastEvaluatedDate: '2026-07-20' };
    expect(evaluateDay(prev, { ...travelDay, assignedOnDate: true }))
      .toEqual({ action: 'skip', reason: 'already_evaluated' });
  });

  it('resets the streak when attendance was marked', () => {
    const prev = { consecutiveMisses: 1, missedDates: ['2026-07-18'], lastEvaluatedDate: '2026-07-18' };
    expect(evaluateDay(prev, { ...travelDay, attendanceMarked: true })).toEqual({
      action: 'reset',
      state: { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: '2026-07-20' },
    });
  });

  it('warns on the first miss', () => {
    expect(evaluateDay(fresh, travelDay)).toEqual({
      action: 'warn',
      state: { consecutiveMisses: 1, missedDates: ['2026-07-20'], lastEvaluatedDate: '2026-07-20' },
    });
  });

  it('removes on the second consecutive miss', () => {
    const prev = { consecutiveMisses: 1, missedDates: ['2026-07-18'], lastEvaluatedDate: '2026-07-18' };
    expect(evaluateDay(prev, travelDay)).toEqual({
      action: 'remove',
      state: {
        consecutiveMisses: 2,
        missedDates: ['2026-07-18', '2026-07-20'],
        lastEvaluatedDate: '2026-07-20',
      },
    });
  });

  it('does NOT remove when a marked day broke the streak (miss, mark, miss)', () => {
    const afterMiss = evaluateDay(fresh, travelDay);
    if (afterMiss.action !== 'warn') throw new Error('expected warn');
    const afterMark = evaluateDay(afterMiss.state, {
      date: '2026-07-21', hasBookedRiders: true, attendanceMarked: true, assignedOnDate: false,
    });
    if (afterMark.action !== 'reset') throw new Error('expected reset');
    const afterSecondMiss = evaluateDay(afterMark.state, {
      date: '2026-07-22', hasBookedRiders: true, attendanceMarked: false, assignedOnDate: false,
    });
    expect(afterSecondMiss.action).toBe('warn');
  });

  it('exposes a removal threshold of 2', () => {
    expect(REMOVAL_THRESHOLD).toBe(2);
  });
});

describe('copy', () => {
  it('names the missed date in the warning', () => {
    const { title, body } = warningCopy(['2026-07-20']);
    expect(title).toMatch(/attendance/i);
    expect(body).toContain('2026-07-20');
  });

  it('says fees apply on removal, and mentions the bill when billed', () => {
    expect(removalCopy(['2026-07-18', '2026-07-20'], true).body).toMatch(/fee/i);
    expect(removalCopy(['2026-07-18', '2026-07-20'], false).body).toMatch(/transport office/i);
  });
});

describe('performRemoval', () => {
  it('revokes BEFORE billing', async () => {
    const calls: string[] = [];
    await performRemoval({
      revoke: async () => { calls.push('revoke'); },
      bill: async () => { calls.push('bill'); return 'billed'; },
    });
    expect(calls).toEqual(['revoke', 'bill']);
  });

  it('keeps the revoke when billing THROWS', async () => {
    let revoked = false;
    const result = await performRemoval({
      revoke: async () => { revoked = true; },
      bill: async () => { throw new Error('billing exploded'); },
    });
    expect(revoked).toBe(true);
    expect(result).toEqual({ revoked: true, billingStatus: 'error' });
  });

  it('keeps the revoke when no fee structure is configured', async () => {
    const result = await performRemoval({
      revoke: async () => {},
      bill: async () => 'no_structure',
    });
    expect(result).toEqual({ revoked: true, billingStatus: 'no_structure' });
  });

  it('propagates a revoke failure (nothing was revoked, so do not report success)', async () => {
    await expect(performRemoval({
      revoke: async () => { throw new Error('revoke failed'); },
      bill: async () => 'billed',
    })).rejects.toThrow('revoke failed');
  });
});
