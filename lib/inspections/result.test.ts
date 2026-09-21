import { describe, it, expect } from 'vitest';
import { computeResult, submitBlockers } from './result';

describe('computeResult', () => {
  it('pass when nothing failed (N/A allowed)', () => {
    expect(computeResult([{ severity: 'critical', result: 'pass' }, { severity: 'normal', result: 'na' }])).toBe('pass');
  });
  it('pass_with_issues when only normal items failed', () => {
    expect(computeResult([{ severity: 'critical', result: 'pass' }, { severity: 'normal', result: 'fail' }])).toBe('pass_with_issues');
  });
  it('fail when any critical item failed', () => {
    expect(computeResult([{ severity: 'critical', result: 'fail' }, { severity: 'normal', result: 'fail' }])).toBe('fail');
  });
});

describe('submitBlockers', () => {
  it('none when every item answered and fails have notes', () => {
    expect(submitBlockers([{ result: 'pass', note: null }, { result: 'fail', note: 'worn' }])).toEqual([]);
  });
  it('reports unanswered items and fails without a note', () => {
    expect(submitBlockers([{ result: null, note: null }, { result: 'fail', note: '  ' }, { result: null, note: null }]))
      .toEqual(['2 items are not answered', '1 failed item needs a note']);
  });
});
