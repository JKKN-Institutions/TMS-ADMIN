import { describe, it, expect } from 'vitest';
import { decideFeeFine, decideBookingFine, isServiceDay, ruleNote, finesRaisedByNote } from './fine-rules';

const NOW = new Date('2026-09-23T04:00:00.000Z');
const ctx = { checkDate: '2026-09-23', now: NOW };
const unpaid = { mark: 'unpaid' as const, term1DueDate: '2026-07-31', runningNoticeExpiresAt: null };

describe('decideFeeFine', () => {
  it('raises for an unpaid learner past the due date with no running notice', () =>
    expect(decideFeeFine(unpaid, ctx)).toEqual({ raise: true }));
  it.each([
    [{ ...unpaid, mark: 'paid' as const }, 'not_unpaid'],
    [{ ...unpaid, mark: 'none' as const }, 'not_unpaid'],
    [{ ...unpaid, mark: 'override' as const }, 'override'],
    [{ ...unpaid, mark: 'unknown' as const }, 'fee_unknown'],
    [{ ...unpaid, term1DueDate: null }, 'deadline_not_passed'],
    [{ ...unpaid, term1DueDate: '2026-09-23' }, 'deadline_not_passed'],
    [{ ...unpaid, runningNoticeExpiresAt: '2026-09-24T00:00:00.000Z' }, 'within_notice_window'],
  ])('%o → %s', (f, note) => expect(decideFeeFine(f, ctx)).toEqual({ raise: false, note }));
  it('an expired running notice does not protect', () =>
    expect(decideFeeFine({ ...unpaid, runningNoticeExpiresAt: '2026-09-22T00:00:00.000Z' }, ctx)).toEqual({ raise: true }));
});

describe('decideBookingFine', () => {
  it('fines only no booking on a service day', () => {
    expect(decideBookingFine('none', { serviceDay: true })).toEqual({ raise: true });
    expect(decideBookingFine('none', { serviceDay: false })).toEqual({ raise: false, note: 'not_service_day' });
    expect(decideBookingFine('this_route', { serviceDay: true })).toEqual({ raise: false, note: 'booked' });
    expect(decideBookingFine('other_route', { serviceDay: true })).toEqual({ raise: false, note: 'booked_other_bus' });
  });
});

describe('isServiceDay', () => {
  it('Sunday and exception dates are not service days', () => {
    expect(isServiceDay('2026-09-27', new Set())).toBe(false); // Sunday
    expect(isServiceDay('2026-09-23', new Set(['2026-09-23']))).toBe(false);
    expect(isServiceDay('2026-09-23', new Set())).toBe(true);
  });
});

describe('ruleNote', () => {
  it('reads each rule out of a combined note', () => {
    expect(ruleNote('fee:raised booking:booked', 'fee')).toBe('raised');
    expect(ruleNote('fee:raised booking:booked', 'booking')).toBe('booked');
  });
  it('applies a whole-check note (no rule prefix) to both rules', () => {
    expect(ruleNote('fines_off', 'fee')).toBe('fines_off');
    expect(ruleNote('error', 'booking')).toBe('error');
  });
  it('is null when there is no note', () => {
    expect(ruleNote(null, 'fee')).toBeNull();
    expect(ruleNote('', 'booking')).toBeNull();
  });
});

describe('finesRaisedByNote', () => {
  it('counts only fines THIS check raised, never earlier ones it found', () => {
    expect(finesRaisedByNote('fee:raised booking:raised')).toBe(2);
    expect(finesRaisedByNote('fee:already_fined booking:raised')).toBe(1);
    expect(finesRaisedByNote('fee:already_fined booking:booked')).toBe(0);
  });
  it('is 0 for fines-off, errors and missing notes', () => {
    expect(finesRaisedByNote('fines_off')).toBe(0);
    expect(finesRaisedByNote('error')).toBe(0);
    expect(finesRaisedByNote(null)).toBe(0);
  });
});
