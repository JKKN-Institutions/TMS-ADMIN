// lib/boarding/fee-roster.test.ts
import { describe, it, expect } from 'vitest';
import { rosterFeeBadge, type BulkFeeRow } from './fee-roster';

const row = (over: Partial<BulkFeeRow> = {}): BulkFeeRow => ({
  learner_id: 'L1', allowed: true, reason: 'current', overdue_count: 0,
  total_owed: 0, unpaid_amount: 0, term1_paid: true, has_bills: true, ...over,
});

describe('rosterFeeBadge', () => {
  it('is paid when everything billed is settled', () => {
    expect(rosterFeeBadge(row())).toEqual({ state: 'paid', owed: 0 });
  });

  it('is unpaid with the amount when something is owed', () => {
    expect(
      rosterFeeBadge(row({ allowed: false, reason: 'overdue', overdue_count: 1, total_owed: 2500, unpaid_amount: 2500 })),
    ).toEqual({ state: 'unpaid', owed: 2500 });
  });

  it('is unpaid when term 1 is unpaid even before the due date', () => {
    expect(
      rosterFeeBadge(row({ allowed: false, reason: 'term1_unpaid', term1_paid: false, unpaid_amount: 5000 })),
    ).toEqual({ state: 'unpaid', owed: 5000 });
  });

  it('says no bill rather than unpaid when nothing is billed', () => {
    expect(
      rosterFeeBadge(row({ allowed: false, reason: 'term1_not_billed', term1_paid: false, has_bills: false })),
    ).toEqual({ state: 'none', owed: null });
    expect(
      rosterFeeBadge(row({ allowed: true, reason: 'no_transport_obligation', has_bills: false })),
    ).toEqual({ state: 'none', owed: null });
  });

  it('is unknown for a missing row, never paid', () => {
    expect(rosterFeeBadge(undefined)).toEqual({ state: 'unknown', owed: null });
    expect(rosterFeeBadge(null)).toEqual({ state: 'unknown', owed: null });
  });
});
