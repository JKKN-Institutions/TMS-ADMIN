import { describe, it, expect } from 'vitest';
import {
  istMinutesOfDay,
  hmToMinutes,
  normalizeTime,
  formatHM,
  isDirectionOpen,
  activeDirection,
  DEFAULT_WINDOWS,
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
  it('morning ⇒ onward', () => {
    expect(activeDirection(DEFAULT_WINDOWS, new Date('2026-06-28T02:30:00Z'))).toBe('onward'); // 08:00 IST
  });
  it('evening ⇒ return', () => {
    expect(activeDirection(DEFAULT_WINDOWS, new Date('2026-06-28T11:30:00Z'))).toBe('return'); // 17:00 IST
  });
  it('midday (no window open) ⇒ null', () => {
    expect(activeDirection(DEFAULT_WINDOWS, new Date('2026-06-28T06:30:00Z'))).toBe(null); // 12:00 IST
  });
});
