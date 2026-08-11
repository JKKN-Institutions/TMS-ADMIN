import { describe, it, expect } from 'vitest';
import { countBornOverdue } from './born-overdue';

describe('countBornOverdue', () => {
  const today = '2026-08-11';

  it('counts a term whose due date has passed', () => {
    expect(countBornOverdue([{ due_date: '2026-07-31' }], today)).toBe(1);
  });

  it('does not count a term due in the future', () => {
    expect(countBornOverdue([{ due_date: '2026-08-31' }], today)).toBe(0);
  });

  it('does not count a term due today — the learner still has the day', () => {
    expect(countBornOverdue([{ due_date: today }], today)).toBe(0);
  });

  it('counts each overdue term separately', () => {
    expect(countBornOverdue(
      [{ due_date: '2026-07-31' }, { due_date: '2026-06-30' }, { due_date: '2026-09-30' }],
      today
    )).toBe(2);
  });

  it('is zero for an empty term list', () => {
    expect(countBornOverdue([], today)).toBe(0);
  });
});
