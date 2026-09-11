import { describe, it, expect } from 'vitest';
import { feeBadge } from './fee-badge';
import type { FeeTerm, LearnerFeeStatus } from './fee-status';

const term = (over: Partial<FeeTerm> = {}): FeeTerm => ({
  termNo: 1, amount: 4500, balance: 0, dueDate: '2026-07-15',
  status: 'paid', paid: true, overdue: false, ...over,
});

const fees = (over: Partial<LearnerFeeStatus> = {}): LearnerFeeStatus => ({
  allowed: true, reason: 'current', overdueCount: 0, totalOwed: 0, terms: [term()], ...over,
});

describe('feeBadge', () => {
  it('renders nothing when an older server sent no fee field at all', () => {
    expect(feeBadge(undefined)).toBeNull();
  });

  it('says unavailable when the fee lookup failed', () => {
    expect(feeBadge(null)).toEqual({ tone: 'unknown', label: 'Fee status unavailable', detail: null });
  });

  it('says paid when every billed term is paid', () => {
    expect(feeBadge(fees())).toEqual({ tone: 'paid', label: 'Fees paid', detail: null });
  });

  it('says not paid, in red, for an overdue term, with the amount and the term', () => {
    const b = feeBadge(fees({
      allowed: false, reason: 'term1_unpaid', overdueCount: 1, totalOwed: 4500,
      terms: [term({ paid: false, overdue: true, balance: 4500, status: 'unpaid' })],
    }));
    expect(b).toEqual({ tone: 'overdue', label: 'Not paid', detail: '₹4,500 · Term 1 overdue' });
  });

  it('says not paid, in red, for an unpaid term 1 even before it falls overdue', () => {
    const b = feeBadge(fees({
      allowed: false, reason: 'term1_unpaid', overdueCount: 0,
      terms: [term({ paid: false, overdue: false, balance: 4500, status: 'unpaid' })],
    }));
    expect(b?.tone).toBe('overdue');
    expect(b?.label).toBe('Not paid');
  });

  it('never says paid when a later term is billed but not yet due', () => {
    // The portal verdict still reads "current" here, which is exactly why the
    // badge is built from the terms and not from the verdict.
    const b = feeBadge(fees({
      allowed: true, reason: 'current',
      terms: [
        term(),
        term({ termNo: 2, paid: false, overdue: false, balance: 2500, dueDate: '2026-12-15', status: 'unpaid' }),
      ],
    }));
    expect(b).toEqual({ tone: 'due', label: 'Not paid', detail: '₹2,500 · Term 2 due 15 Dec 2026' });
  });

  it('never says not paid to a learner who has not been billed', () => {
    const b = feeBadge(fees({ allowed: false, reason: 'term1_not_billed', terms: [] }));
    expect(b).toEqual({ tone: 'none', label: 'No fee bill yet', detail: null });
  });

  it('says there is no transport fee for a learner with no transport obligation', () => {
    const b = feeBadge(fees({ allowed: true, reason: 'no_transport_obligation', terms: [] }));
    expect(b).toEqual({ tone: 'none', label: 'No transport fee', detail: null });
  });

  it('never says paid for a result it does not recognise', () => {
    const b = feeBadge(fees({ allowed: true, reason: 'no_current_transport_year', terms: [] }));
    expect(b?.tone).toBe('unknown');
  });

  it('never says paid when the verdict and the terms disagree', () => {
    // Blocked, yet no unpaid term: something is inconsistent. Fail closed.
    const b = feeBadge(fees({ allowed: false, reason: 'overdue', terms: [term()] }));
    expect(b?.tone).toBe('unknown');
  });

  it('leaves the amount out rather than print a wrong one when a balance is unknown', () => {
    const b = feeBadge(fees({
      allowed: false, reason: 'overdue', overdueCount: 1,
      terms: [term({ paid: false, overdue: true, balance: null, status: 'unpaid' })],
    }));
    expect(b?.detail).toBe('Term 1 overdue');
  });
});
