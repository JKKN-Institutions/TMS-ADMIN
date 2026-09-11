import { describe, it, expect } from 'vitest';
import { decideMarkDirection, decideClearDirection, openHoursText } from './trip-direction';
import { DEFAULT_WINDOWS, type AttendanceWindows } from './attendance-window';

// IST is UTC+5:30. 08:00 IST = 02:30Z, 17:00 IST = 11:30Z, 20:00 IST = 14:30Z.
const AT_0800 = new Date('2026-09-12T02:30:00Z');
const AT_1700 = new Date('2026-09-12T11:30:00Z');
const AT_2000 = new Date('2026-09-12T14:30:00Z');

const eveningOn: AttendanceWindows = {
  onward: { ...DEFAULT_WINDOWS.onward },
  return: { ...DEFAULT_WINDOWS.return, active: true },
};
const eveningOff = DEFAULT_WINDOWS;

describe('openHoursText', () => {
  it('names only the morning while evening is off', () => {
    expect(openHoursText(eveningOff)).toBe('morning 7:00 AM–9:30 AM');
  });
  it('names both trips while evening is on', () => {
    expect(openHoursText(eveningOn)).toBe('morning 7:00 AM–9:30 AM, evening 4:30 PM–7:00 PM');
  });
});

describe('decideMarkDirection, ordinary staff', () => {
  const staff = (windows: AttendanceWindows, requested: unknown, now: Date) =>
    decideMarkDirection({ windows, requested, windowExempt: false, now });

  it('is the morning trip in the morning', () => {
    expect(staff(eveningOff, undefined, AT_0800)).toEqual({ ok: true, direction: 'onward' });
  });
  it('accepts a request that names the trip the clock agrees with', () => {
    expect(staff(eveningOn, 'onward', AT_0800)).toEqual({ ok: true, direction: 'onward' });
  });
  it('is the evening trip in the evening when evening is on', () => {
    expect(staff(eveningOn, undefined, AT_1700)).toEqual({ ok: true, direction: 'return' });
  });
  it('refuses a stale screen that asks for the morning trip during the evening', () => {
    expect(staff(eveningOn, 'onward', AT_1700)).toEqual({
      ok: false, status: 409, reason: 'wrong_trip',
      error: 'It is the evening trip now. Reload the page to mark it.',
    });
  });
  it('refuses outside every open window, naming the hours of both trips', () => {
    expect(staff(eveningOn, undefined, AT_2000)).toEqual({
      ok: false, status: 409, reason: 'window_closed',
      error: 'Attendance is open morning 7:00 AM–9:30 AM, evening 4:30 PM–7:00 PM only.',
    });
  });
  it('refuses the evening while evening is switched off', () => {
    expect(staff(eveningOff, undefined, AT_1700)).toEqual({
      ok: false, status: 409, reason: 'window_closed',
      error: 'Attendance is open morning 7:00 AM–9:30 AM only.',
    });
  });
  it('refuses an unknown trip value', () => {
    expect(staff(eveningOn, 'sideways', AT_0800)).toEqual({
      ok: false, status: 400, reason: 'bad_direction', error: 'Unknown trip.',
    });
  });
});

describe('decideMarkDirection, window-exempt correction', () => {
  const exempt = (windows: AttendanceWindows, requested: unknown, now: Date) =>
    decideMarkDirection({ windows, requested, windowExempt: true, now });

  it('corrects the trip it names, even with no window open', () => {
    expect(exempt(eveningOn, 'return', AT_2000)).toEqual({ ok: true, direction: 'return' });
  });
  it('may not correct the evening while evening is switched off', () => {
    expect(exempt(eveningOff, 'return', AT_2000)).toEqual({
      ok: false, status: 409, reason: 'evening_off', error: 'Evening attendance is switched off.',
    });
  });
  it('falls back to the clock when no trip is named', () => {
    expect(exempt(eveningOn, undefined, AT_1700)).toEqual({ ok: true, direction: 'return' });
  });
  it('falls back to the morning when no trip is named and none is open', () => {
    expect(exempt(eveningOn, undefined, AT_2000)).toEqual({ ok: true, direction: 'onward' });
  });
});

describe('decideClearDirection', () => {
  it('undoes the morning mark when no trip is named', () => {
    expect(decideClearDirection({ windows: eveningOn, requested: undefined })).toEqual({ ok: true, direction: 'onward' });
  });
  it('undoes the trip it names, not the one the clock says', () => {
    // An undo has no time window: at 17:00, undoing a morning mark must not
    // delete the evening one.
    expect(decideClearDirection({ windows: eveningOn, requested: 'onward' })).toEqual({ ok: true, direction: 'onward' });
    expect(decideClearDirection({ windows: eveningOn, requested: 'return' })).toEqual({ ok: true, direction: 'return' });
  });
  it('refuses the evening while evening is switched off', () => {
    expect(decideClearDirection({ windows: eveningOff, requested: 'return' })).toEqual({
      ok: false, status: 409, reason: 'evening_off', error: 'Evening attendance is switched off.',
    });
  });
  it('refuses an unknown trip value', () => {
    expect(decideClearDirection({ windows: eveningOn, requested: 'x' })).toEqual({
      ok: false, status: 400, reason: 'bad_direction', error: 'Unknown trip.',
    });
  });
});
