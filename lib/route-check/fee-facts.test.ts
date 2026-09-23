import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import { loadLearnerFeeFacts } from './fee-facts';

// makeFakeSupabase does not filter: each table returns its canned rows, so the
// fixtures below are exactly what the queries WOULD return.
function data(): Record<string, unknown[]> {
  return {
    tms_transport_year: [{ id: 'Y' }],
    tms_fee_override: [],
    tms_fee_bill: [{ person_id: 'A', term_no: 1, due_date: '2026-08-01', status: 'generated', billing_student_bill_id: 'b1' }],
    billing_student_bills: [{ id: 'b1', status: 'unpaid', final_amount: 500, balance_amount: 500 }],
    billing_bill_instalments: [],
    tms_fee_payment_notice: [],
  };
}

describe('loadLearnerFeeFacts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads real marks when every query succeeds', async () => {
    const svc = makeFakeSupabase(data());
    const { yearId, facts } = await loadLearnerFeeFacts(svc as never, ['A', 'B']);
    expect(yearId).toBe('Y');
    expect(facts.get('A')).toMatchObject({ mark: 'unpaid', term1DueDate: '2026-08-01', hasBill: true });
    expect(facts.get('B')).toMatchObject({ mark: 'none', hasBill: false });
  });

  it.each([
    'tms_transport_year',
    'tms_fee_bill',
    'billing_student_bills',
    'tms_fee_override',
    'tms_fee_payment_notice',
  ])('marks EVERY learner unknown when the %s read errors', async (table) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const svc = makeFakeSupabase(data(), { errors: { [table]: { message: 'boom' } } });
    const { facts } = await loadLearnerFeeFacts(svc as never, ['A', 'B']);
    expect([...facts.keys()].sort()).toEqual(['A', 'B']);
    for (const f of facts.values()) {
      expect(f).toEqual({ mark: 'unknown', term1DueDate: null, runningNoticeExpiresAt: null, hasBill: false });
    }
  });
});
