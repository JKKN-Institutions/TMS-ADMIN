import { describe, it, expect } from 'vitest';
import { fmtTime, fmtIST } from './format';

describe('fmtTime', () => {
  it('trims seconds from a HH:MM:SS time', () => {
    expect(fmtTime('07:45:00')).toBe('07:45');
  });
  it('shows a dash when the time is missing', () => {
    expect(fmtTime(null)).toBe('—');
    expect(fmtTime('')).toBe('—');
  });
});

describe('fmtIST', () => {
  it('renders a UTC instant as IST HH:MM (UTC+5:30)', () => {
    expect(fmtIST('2026-09-21T02:15:00Z')).toBe('07:45');
  });
  it('uses the 24-hour clock', () => {
    expect(fmtIST('2026-09-21T12:00:00Z')).toBe('17:30');
  });
});
