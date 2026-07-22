import { describe, it, expect } from 'vitest';
import { formatCutoffHour, reminderCopy } from './reminder-copy';

describe('formatCutoffHour', () => {
  it('formats midday and midnight', () => {
    expect(formatCutoffHour(0)).toBe('12 AM');
    expect(formatCutoffHour(12)).toBe('12 PM');
  });
  it('formats morning and evening hours', () => {
    expect(formatCutoffHour(9)).toBe('9 AM');
    expect(formatCutoffHour(20)).toBe('8 PM');
    expect(formatCutoffHour(19)).toBe('7 PM');
  });
});

describe('reminderCopy', () => {
  it('states the configured cutoff, not a hardcoded 8 PM', () => {
    const copy = reminderCopy('2026-07-23', 19);
    expect(copy.body).toContain('7 PM');
    expect(copy.body).not.toContain('8 PM');
  });
  it('names the travel date', () => {
    expect(reminderCopy('2026-07-23', 20).body).toContain('2026-07-23');
  });
  it('has a stable, non-empty title', () => {
    expect(reminderCopy('2026-07-23', 20).title.length).toBeGreaterThan(0);
  });
  it('announces NO deadline when the time window is disabled (cutoffHour null)', () => {
    // Disabling the daily window means there is no "closes at X" today. Announcing
    // the stored hour anyway would state a deadline that does not exist.
    const copy = reminderCopy('2026-07-23', null);
    expect(copy.body).not.toContain('closes at');
    expect(copy.body).toContain('2026-07-23');
    expect(copy.body).toContain('stays open');
  });
});
