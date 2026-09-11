import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  istMinutesOfDay,
  hmToMinutes,
  normalizeTime,
  formatHM,
  isDirectionOpen,
  activeDirection,
  validateWindows,
  loadAttendanceWindows,
  readAttendanceWindows,
  DEFAULT_WINDOWS,
  type AttendanceWindows,
} from './attendance-window';

describe('istMinutesOfDay', () => {
  it('converts a UTC instant to IST minutes of day', () => {
    // 02:30 UTC + 5:30 = 08:00 IST = 480
    expect(istMinutesOfDay(new Date('2026-06-28T02:30:00Z'))).toBe(480);
  });
  it('wraps across UTC midnight into the IST early morning', () => {
    // 20:00 UTC = 01:30 IST (next day) = 90
    expect(istMinutesOfDay(new Date('2026-06-28T20:00:00Z'))).toBe(90);
  });
});

describe('hmToMinutes / normalizeTime / formatHM', () => {
  it('hmToMinutes', () => {
    expect(hmToMinutes('07:00')).toBe(420);
    expect(hmToMinutes('16:30')).toBe(990);
  });
  it('normalizeTime strips seconds', () => {
    expect(normalizeTime('07:00:00')).toBe('07:00');
  });
  it('formatHM renders 12-hour clock', () => {
    expect(formatHM('07:00')).toBe('7:00 AM');
    expect(formatHM('09:30')).toBe('9:30 AM');
    expect(formatHM('16:30')).toBe('4:30 PM');
    expect(formatHM('00:00')).toBe('12:00 AM');
    expect(formatHM('12:00')).toBe('12:00 PM');
  });
});

describe('isDirectionOpen', () => {
  const onward = DEFAULT_WINDOWS.onward; // 07:00–09:30
  it('open inside the window', () => {
    expect(isDirectionOpen(onward, new Date('2026-06-28T02:30:00Z'))).toBe(true); // 08:00 IST
  });
  it('closed at/after the end (exclusive)', () => {
    expect(isDirectionOpen(onward, new Date('2026-06-28T04:00:00Z'))).toBe(false); // 09:30 IST
  });
  it('closed before the start', () => {
    expect(isDirectionOpen(onward, new Date('2026-06-28T01:00:00Z'))).toBe(false); // 06:30 IST
  });
  it('a disabled window is always open (no restriction)', () => {
    expect(isDirectionOpen({ ...onward, enabled: false }, new Date('2026-06-28T06:30:00Z'))).toBe(true); // 12:00 IST
  });
});

describe('activeDirection', () => {
  it('returns onward while the onward window is open', () => {
    // 08:00 IST = 02:30 UTC
    expect(activeDirection(DEFAULT_WINDOWS, new Date('2026-07-23T02:30:00Z'))).toBe('onward');
  });
  it('returns null outside the onward window', () => {
    // 18:00 IST = 12:30 UTC — the old return window; now nothing is open
    expect(activeDirection(DEFAULT_WINDOWS, new Date('2026-07-23T12:30:00Z'))).toBeNull();
  });
  it('returns onward at any time when the window is disabled', () => {
    const win: AttendanceWindows = {
      ...DEFAULT_WINDOWS,
      onward: { ...DEFAULT_WINDOWS.onward, enabled: false },
    };
    expect(activeDirection(win, new Date('2026-07-23T12:30:00Z'))).toBe('onward');
  });
});

// IST is UTC+5:30. 08:00 IST = 02:30Z, 16:30 IST = 11:00Z, 17:00 IST = 11:30Z, 20:00 IST = 14:30Z.
const withEvening = (over: Partial<AttendanceWindows['return']> = {}): AttendanceWindows => ({
  onward: { ...DEFAULT_WINDOWS.onward },
  return: { ...DEFAULT_WINDOWS.return, active: true, ...over },
});

describe('activeDirection with two trips', () => {
  it('is onward inside the morning window', () => {
    expect(activeDirection(withEvening(), new Date('2026-07-23T02:30:00Z'))).toBe('onward');
  });
  it('is return inside the evening window when evening is switched on', () => {
    expect(activeDirection(withEvening(), new Date('2026-07-23T11:30:00Z'))).toBe('return');
  });
  it('is null inside the evening window when evening is switched off', () => {
    expect(activeDirection(DEFAULT_WINDOWS, new Date('2026-07-23T11:30:00Z'))).toBeNull();
  });
  it('is null outside both windows', () => {
    expect(activeDirection(withEvening(), new Date('2026-07-23T14:30:00Z'))).toBeNull();
  });
  it('lets morning win if stored data overlaps despite validation', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward, end: '17:30' },
      return: { ...DEFAULT_WINDOWS.return, active: true },
    };
    expect(activeDirection(w, new Date('2026-07-23T11:30:00Z'))).toBe('onward');
  });
});

describe('validateWindows', () => {
  it('accepts the defaults', () => {
    expect(validateWindows(DEFAULT_WINDOWS)).toBeNull();
  });
  it('refuses overlapping windows when evening is switched on', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward, end: '17:30' },
      return: { ...DEFAULT_WINDOWS.return, active: true },
    };
    expect(validateWindows(w)).toBe('End the morning window at or before 4:30 PM to switch on evening attendance.');
  });
  it('allows a morning that ends exactly when the evening starts', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward, end: '16:30' },
      return: { ...DEFAULT_WINDOWS.return, active: true },
    };
    expect(validateWindows(w)).toBeNull();
  });
  it('refuses switching evening on while either trip has no set hours', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward, enabled: false },
      return: { ...DEFAULT_WINDOWS.return, active: true },
    };
    expect(validateWindows(w)).toBe('To switch on evening attendance, both trips need set hours. Turn Enforce on for both.');
  });
  it('ignores the evening times while evening is switched off', () => {
    const w: AttendanceWindows = {
      onward: { ...DEFAULT_WINDOWS.onward },
      return: { ...DEFAULT_WINDOWS.return, start: '19:00', end: '16:00', active: false },
    };
    expect(validateWindows(w)).toBeNull();
  });
  it('refuses an evening that starts after it ends when switched on', () => {
    expect(validateWindows(withEvening({ start: '19:00', end: '16:00' })))
      .toBe('Evening: start time must be before end time');
  });
  it('refuses a morning that starts after it ends', () => {
    const w: AttendanceWindows = { ...DEFAULT_WINDOWS, onward: { ...DEFAULT_WINDOWS.onward, start: '10:00', end: '09:00' } };
    expect(validateWindows(w)).toBe('Morning: start time must be before end time');
  });
});

describe('loadAttendanceWindows', () => {
  const fakeSvc = (result: { data: unknown; error: unknown }) =>
    ({ from: () => ({ select: async () => result }) }) as unknown as SupabaseClient;

  it('reads both trips and the evening switch', async () => {
    const w = await loadAttendanceWindows(fakeSvc({
      data: [
        { direction: 'onward', start_time: '07:00:00', end_time: '16:30:00', enabled: true, is_active: true },
        { direction: 'return', start_time: '16:30:00', end_time: '19:00:00', enabled: true, is_active: true },
      ],
      error: null,
    }));
    expect(w.onward).toEqual({ direction: 'onward', start: '07:00', end: '16:30', enabled: true, active: true });
    expect(w.return).toEqual({ direction: 'return', start: '16:30', end: '19:00', enabled: true, active: true });
  });
  it('never treats the morning row as switched off', async () => {
    const w = await loadAttendanceWindows(fakeSvc({
      data: [{ direction: 'onward', start_time: '07:00:00', end_time: '09:30:00', enabled: true, is_active: false }],
      error: null,
    }));
    expect(w.onward.active).toBe(true);
  });
  it('keeps evening off when there is no evening row', async () => {
    const w = await loadAttendanceWindows(fakeSvc({
      data: [{ direction: 'onward', start_time: '07:00:00', end_time: '09:30:00', enabled: true, is_active: true }],
      error: null,
    }));
    expect(w.return.active).toBe(false);
  });
  it('falls back to the defaults on a read error', async () => {
    const w = await loadAttendanceWindows(fakeSvc({ data: null, error: { message: 'boom' } }));
    expect(w).toEqual(DEFAULT_WINDOWS);
  });
});

describe('readAttendanceWindows', () => {
  const fakeSvc = (result: { data: unknown; error: unknown }) =>
    ({ from: () => ({ select: async () => result }) }) as unknown as SupabaseClient;

  it('returns null on a read error, instead of masking it as defaults', async () => {
    const w = await readAttendanceWindows(fakeSvc({ data: null, error: { message: 'boom' } }));
    expect(w).toBeNull();
  });
});
