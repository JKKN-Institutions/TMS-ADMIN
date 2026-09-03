import { describe, expect, it } from 'vitest';
import { relativeTime, shortDayLabel, percentOf } from './format';

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
