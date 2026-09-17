import { describe, it, expect } from 'vitest';
import { summariseActions, reviewMessage } from './concessions';

describe('summariseActions', () => {
  it('no bill → override_only', () => expect(summariseActions([])).toBe('override_only'));
  it('any repriced or deleted row wins', () => {
    expect(summariseActions([{ action: 'unchanged' }, { action: 'repriced' }])).toBe('repriced');
    expect(summariseActions([{ action: 'ledger_aligned' }, { action: 'deleted' }])).toBe('repriced');
  });
  it('ledger_aligned beats unchanged', () => {
    expect(summariseActions([{ action: 'unchanged' }, { action: 'ledger_aligned' }])).toBe('ledger_aligned');
    expect(summariseActions([{ action: 'unchanged' }])).toBe('unchanged');
  });
});

describe('reviewMessage', () => {
  it('extracts the review text from a CONCESSION_REVIEW error', () => {
    expect(reviewMessage('CONCESSION_REVIEW: term 1 has Rs 5500 paid')).toBe('term 1 has Rs 5500 paid');
  });
  it('returns null for other errors', () => {
    expect(reviewMessage('permission denied')).toBeNull();
  });
});
