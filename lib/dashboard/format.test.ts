import { describe, expect, it } from 'vitest';
import { formatTime, relativeTime, shortDayLabel, percentOf } from './format';

describe('relativeTime', () => {
  const now = new Date('2026-09-03T12:00:00Z');

  it('treats the last minute as "just now"', () => {
    expect(relativeTime('2026-09-03T11:59:30Z', now)).toBe('just now');
  });

  it('clamps a future timestamp from clock skew to "just now"', () => {
    expect(relativeTime('2026-09-03T12:00:05Z', now)).toBe('just now');
  });

  it('reports minutes within the hour', () => {
    expect(relativeTime('2026-09-03T11:46:00Z', now)).toBe('14m ago');
  });

  it('reports hours within the day', () => {
    expect(relativeTime('2026-09-03T09:00:00Z', now)).toBe('3h ago');
  });

  it('reports days within the week', () => {
    expect(relativeTime('2026-09-01T12:00:00Z', now)).toBe('2d ago');
  });

  it('falls back to a calendar date beyond a week', () => {
    expect(relativeTime('2026-08-01T12:00:00Z', now)).toMatch(/Aug/);
  });

  it('returns empty for an unparseable timestamp', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});

describe('shortDayLabel', () => {
  it('renders the weekday of the given calendar date', () => {
    // 2026-09-03 is a Thursday. Parsing must not slide west of UTC into Wed.
    expect(shortDayLabel('2026-09-03')).toBe('Thu');
  });

  it('passes an unparseable date straight through', () => {
    expect(shortDayLabel('garbage')).toBe('garbage');
  });
});

describe('percentOf', () => {
  it('rounds to a whole percent', () => {
    expect(percentOf(930, 1251)).toBe(74);
  });

  it('returns null when there is no denominator', () => {
    // A day with no bookings has no boarding rate — 0% would be a claim we
    // cannot support.
    expect(percentOf(0, 0)).toBeNull();
  });
});

describe('formatTime', () => {
  it('renders a morning departure in 12-hour form', () => {
    expect(formatTime('07:30:00')).toBe('7:30 am');
  });

  it('renders an afternoon time as pm', () => {
    expect(formatTime('16:45:00')).toBe('4:45 pm');
  });

  it('renders noon as 12 pm, not 0 pm', () => {
    expect(formatTime('12:00:00')).toBe('12:00 pm');
  });

  it('renders midnight as 12 am, not 0 am', () => {
    expect(formatTime('00:05:00')).toBe('12:05 am');
  });

  it('pads single-digit minutes', () => {
    expect(formatTime('08:05:00')).toBe('8:05 am');
  });

  it('shows a dash when no time is recorded', () => {
    expect(formatTime(null)).toBe('—');
  });

  it('shows a dash for an unparseable value', () => {
    expect(formatTime('not-a-time')).toBe('—');
  });
});
