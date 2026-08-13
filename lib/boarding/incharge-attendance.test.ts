import { describe, it, expect } from 'vitest';
import {
  evaluateDay,
  isServiceWeekday,
  warningCopy,
  removalCopy,
  performRemoval,
  REMOVAL_THRESHOLD,
  type StrikeState,
} from './incharge-attendance';

const fresh: StrikeState = { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: null };
const travelDay = {
  date: '2026-07-20',
  hasBookedRiders: true,
  attendanceMarked: false,
  assignedOnDate: false,
  isServiceWeekday: true,
};

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

  it('warns again on the second consecutive miss (final warning)', () => {
    const prev = { consecutiveMisses: 1, missedDates: ['2026-07-17'], lastEvaluatedDate: '2026-07-17' };
    expect(evaluateDay(prev, travelDay)).toEqual({
      action: 'warn',
      state: {
        consecutiveMisses: 2,
        missedDates: ['2026-07-17', '2026-07-20'],
        lastEvaluatedDate: '2026-07-20',
      },
    });
  });

  it('removes on the THIRD consecutive miss', () => {
    const prev = {
      consecutiveMisses: 2,
      missedDates: ['2026-07-16', '2026-07-17'],
      lastEvaluatedDate: '2026-07-17',
    };
    expect(evaluateDay(prev, travelDay)).toEqual({
      action: 'remove',
      state: {
        consecutiveMisses: 3,
        missedDates: ['2026-07-16', '2026-07-17', '2026-07-20'],
        lastEvaluatedDate: '2026-07-20',
      },
    });
  });

  it('a marked day at two misses resets the streak to zero', () => {
    const prev = {
      consecutiveMisses: 2,
      missedDates: ['2026-07-16', '2026-07-17'],
      lastEvaluatedDate: '2026-07-17',
    };
    expect(evaluateDay(prev, { ...travelDay, attendanceMarked: true })).toEqual({
      action: 'reset',
      state: { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: '2026-07-20' },
    });
  });

  it('does NOT remove when a marked day broke the streak (miss, mark, miss)', () => {
    const afterMiss = evaluateDay(fresh, travelDay);
    if (afterMiss.action !== 'warn') throw new Error('expected warn');
    const afterMark = evaluateDay(afterMiss.state, {
      ...travelDay, date: '2026-07-21', attendanceMarked: true,
    });
    if (afterMark.action !== 'reset') throw new Error('expected reset');
    const afterSecondMiss = evaluateDay(afterMark.state, { ...travelDay, date: '2026-07-22' });
    expect(afterSecondMiss.action).toBe('warn');
  });

  it('skips a weekend even when the route has booked riders', () => {
    expect(evaluateDay(fresh, { ...travelDay, isServiceWeekday: false }))
      .toEqual({ action: 'skip', reason: 'not_a_service_day' });
  });

  it('a weekend neither punishes nor forgives an existing streak', () => {
    const prev = { consecutiveMisses: 2, missedDates: ['2026-07-16', '2026-07-17'], lastEvaluatedDate: '2026-07-17' };
    const out = evaluateDay(prev, { ...travelDay, isServiceWeekday: false });
    expect(out).toEqual({ action: 'skip', reason: 'not_a_service_day' });
    // The caller persists nothing on a skip, so the streak survives untouched.
    expect(prev.consecutiveMisses).toBe(2);
  });

  it('already-evaluated takes precedence over a weekend', () => {
    const prev = { ...fresh, lastEvaluatedDate: '2026-07-20' };
    expect(evaluateDay(prev, { ...travelDay, isServiceWeekday: false }))
      .toEqual({ action: 'skip', reason: 'already_evaluated' });
  });

  it('exposes a removal threshold of 3 (two warnings, then removal)', () => {
    expect(REMOVAL_THRESHOLD).toBe(3);
  });
});

describe('isServiceWeekday', () => {
  // 2026-08-10 is a Monday; the week runs Mon..Sun.
  it('accepts Monday through Friday', () => {
    for (const d of ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']) {
      expect(isServiceWeekday(d)).toBe(true);
    }
  });

  it('rejects Saturday and Sunday', () => {
    expect(isServiceWeekday('2026-08-15')).toBe(false);
    expect(isServiceWeekday('2026-08-16')).toBe(false);
  });

  it('reads the date string literally, not through the host timezone', () => {
    // A naive `new Date('2026-08-16')` is midnight UTC, which is still the 15th
    // in the Americas. The IST day-of-week must not depend on where this runs.
    expect(isServiceWeekday('2026-08-16')).toBe(false);
  });

  it('rejects a malformed date rather than guessing', () => {
    expect(isServiceWeekday('not-a-date')).toBe(false);
  });
});

describe('copy', () => {
  it('names the missed date in the warning', () => {
    const { title, body } = warningCopy(['2026-07-20'], false);
    expect(title).toMatch(/attendance/i);
    expect(body).toContain('2026-07-20');
  });

  it('escalates the second warning to a final warning', () => {
    const first = warningCopy(['2026-07-20'], false);
    const final = warningCopy(['2026-07-17', '2026-07-20'], true);
    expect(final.title).toMatch(/final/i);
    expect(final.body).toMatch(/final warning/i);
    expect(final.title).not.toBe(first.title);
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

describe('backfill ordering (dates only ever move forward)', () => {
  it('skips a date EARLIER than the last evaluated one', () => {
    const prev = { consecutiveMisses: 1, missedDates: ['2026-08-12'], lastEvaluatedDate: '2026-08-12' };
    expect(evaluateDay(prev, { ...travelDay, date: '2026-08-11' }))
      .toEqual({ action: 'skip', reason: 'already_evaluated' });
  });

  it('still skips the exact same date (unchanged behaviour)', () => {
    const prev = { consecutiveMisses: 1, missedDates: ['2026-08-12'], lastEvaluatedDate: '2026-08-12' };
    expect(evaluateDay(prev, { ...travelDay, date: '2026-08-12' }))
      .toEqual({ action: 'skip', reason: 'already_evaluated' });
  });

  it('accepts a LATER date', () => {
    const prev = { consecutiveMisses: 1, missedDates: ['2026-08-11'], lastEvaluatedDate: '2026-08-11' };
    const out = evaluateDay(prev, { ...travelDay, date: '2026-08-12' });
    expect(out.action).toBe('warn');
  });

  it('a two-day backfill then today reaches removal exactly once', () => {
    // Tue -> Wed -> Thu, all missed. This is the real backfill scenario.
    let state: StrikeState = { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: null };
    const actions: string[] = [];
    for (const date of ['2026-08-11', '2026-08-12', '2026-08-13']) {
      const out = evaluateDay(state, { ...travelDay, date });
      actions.push(out.action);
      if (out.action !== 'skip') state = out.state;
    }
    expect(actions).toEqual(['warn', 'warn', 'remove']);
    expect(state.consecutiveMisses).toBe(3);
  });

  it('replaying the whole backfill cannot remove a second time', () => {
    let state: StrikeState = { consecutiveMisses: 0, missedDates: [], lastEvaluatedDate: null };
    for (const date of ['2026-08-11', '2026-08-12', '2026-08-13']) {
      const out = evaluateDay(state, { ...travelDay, date });
      if (out.action !== 'skip') state = out.state;
    }
    // Re-run every date: all must skip, streak frozen at 3.
    const replay = ['2026-08-11', '2026-08-12', '2026-08-13'].map(
      (date) => evaluateDay(state, { ...travelDay, date }).action,
    );
    expect(replay).toEqual(['skip', 'skip', 'skip']);
    expect(state.consecutiveMisses).toBe(3);
  });
});
