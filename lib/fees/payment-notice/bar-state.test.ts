import { describe, it, expect } from 'vitest';
import { barState, remainingMs, clockOffset, formatRemaining } from './bar-state';

const running = { status: 'running' as const, expires_at: '2026-09-24T04:30:00.000Z', amount: 1200, urgent_hours: 6 };

describe('barState', () => {
  it('is hidden with no notice', () => expect(barState(null, 1)).toBe('hidden'));
  it('is running with more than the urgent window left', () => expect(barState(running, 7 * 3_600_000)).toBe('running'));
  it('is urgent inside the urgent window', () => expect(barState(running, 6 * 3_600_000)).toBe('urgent'));
  it('is processing at zero while still running', () => expect(barState(running, 0)).toBe('processing'));
  it('is fined once fined, regardless of time', () =>
    expect(barState({ ...running, status: 'fined' }, 9e9)).toBe('fined'));
});

describe('clock maths', () => {
  it('corrects a client clock that runs 5 minutes fast', () => {
    const client = Date.parse('2026-09-23T06:05:00.000Z');
    const offset = clockOffset('2026-09-23T06:00:00.000Z', client);
    expect(offset).toBe(-300_000);
    expect(remainingMs('2026-09-23T07:00:00.000Z', client, offset)).toBe(3_600_000);
  });
});

describe('formatRemaining', () => {
  it('formats HH:MM:SS up to 48 hours', () => {
    expect(formatRemaining(48 * 3_600_000)).toBe('48:00:00');
    expect(formatRemaining(41 * 3_600_000 + 12 * 60_000 + 8_000)).toBe('41:12:08');
  });
  it('clamps negatives to zero', () => expect(formatRemaining(-5)).toBe('00:00:00'));
});
