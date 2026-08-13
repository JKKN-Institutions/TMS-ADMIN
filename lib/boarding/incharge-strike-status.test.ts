import { describe, it, expect } from 'vitest';
import { deriveStrikeStatus } from './incharge-strike-status';

describe('deriveStrikeStatus', () => {
  it('reports a clean record as ok', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 0, removed_at: null })).toBe('ok');
  });

  it('reports one miss as warned', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 1, removed_at: null })).toBe('warned');
  });

  it('reports two misses as a final warning', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 2, removed_at: null })).toBe('final_warning');
  });

  it('reports three misses with no removal as pending removal', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 3, removed_at: null })).toBe('pending_removal');
    expect(deriveStrikeStatus({ consecutive_misses: 7, removed_at: null })).toBe('pending_removal');
  });

  it('reports removed once removed_at is set, whatever the count', () => {
    expect(deriveStrikeStatus({ consecutive_misses: 3, removed_at: '2026-08-12T15:30:00Z' })).toBe('removed');
    expect(deriveStrikeStatus({ consecutive_misses: 0, removed_at: '2026-08-12T15:30:00Z' })).toBe('removed');
  });
});
