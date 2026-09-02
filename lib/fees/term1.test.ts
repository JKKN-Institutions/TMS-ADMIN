import { describe, it, expect, vi, afterEach } from 'vitest';
import { isTerm1Paid, term1PaidLearnerIds } from './term1';
import { makeFakeSupabase } from './__testing__/fake-supabase';

describe('isTerm1Paid', () => {
  it('is true only for a generated ledger row whose money row is paid', () => {
    expect(isTerm1Paid('generated', 'paid')).toBe(true);
  });

  it('is false when the money row is not fully paid', () => {
    expect(isTerm1Paid('generated', 'unpaid')).toBe(false);
    expect(isTerm1Paid('generated', 'partially_paid')).toBe(false);
    expect(isTerm1Paid('generated', 'overdue')).toBe(false);
  });

  it('is false for a cancelled (vacated) ledger row even if the money row says paid', () => {
    expect(isTerm1Paid('cancelled', 'paid')).toBe(false);
  });

  it('is false for a staff_deferred ledger row', () => {
    expect(isTerm1Paid('staff_deferred', 'paid')).toBe(false);
  });

  it('is false when either side is missing', () => {
    expect(isTerm1Paid(null, 'paid')).toBe(false);
    expect(isTerm1Paid('generated', null)).toBe(false);
    expect(isTerm1Paid(undefined, undefined)).toBe(false);
  });
});

describe('isTerm1Paid — instalment bills', () => {
  it('clears term 1 when instalment 1 is settled, even though the bill is only partially paid', () => {
    // The whole point: a learner paying by instalments must not be locked out.
    expect(
      isTerm1Paid('generated', 'partially_paid', {
        paid: 2750,
        instalments: [{ amount: 2750 }, { amount: 2750 }],
      })
    ).toBe(true);
  });

  it('does NOT clear term 1 when instalment 1 is only part-paid', () => {
    expect(
      isTerm1Paid('generated', 'partially_paid', {
        paid: 1000,
        instalments: [{ amount: 2750 }, { amount: 2750 }],
      })
    ).toBe(false);
  });

  it('clears term 1 when the whole instalment bill is paid', () => {
    expect(
      isTerm1Paid('generated', 'paid', {
        paid: 5500,
        instalments: [{ amount: 2750 }, { amount: 2750 }],
      })
    ).toBe(true);
  });

  it('falls back to the whole-bill rule when the bill has no instalments', () => {
    // Every pre-change bill, and the 15 part-paid learners we do not convert.
    expect(isTerm1Paid('generated', 'paid', { paid: 3000, instalments: [] })).toBe(true);
    expect(isTerm1Paid('generated', 'partially_paid', { paid: 1, instalments: [] })).toBe(false);
    expect(isTerm1Paid('generated', 'paid')).toBe(true);
  });

  it('stays fail-closed for a cancelled ledger row regardless of instalments', () => {
    expect(
      isTerm1Paid('cancelled', 'paid', { paid: 5500, instalments: [{ amount: 2750 }, { amount: 2750 }] })
    ).toBe(false);
  });

  it('stays fail-closed for a cancelled MONEY row even with a live ledger row and instalments', () => {
    // A voided bill (billing_student_bills.status = 'cancelled') carries
    // balance_amount = 0, so `paid` computes to the full final_amount and
    // instalment 1 would read as settled. The cancelled status must be
    // rejected before the instalment branch runs.
    expect(
      isTerm1Paid('generated', 'cancelled', { paid: 5500, instalments: [{ amount: 2750 }, { amount: 2750 }] })
    ).toBe(false);
  });
});

describe('term1PaidLearnerIds', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT clear a multi-ledger-row learner whose term 2 is paid but term 1 is not', async () => {
    const svc = makeFakeSupabase({
      tms_fee_bill: [
        { person_id: 'L1', status: 'generated', billing_student_bill_id: 'b1', term_no: 1 },
        { person_id: 'L1', status: 'generated', billing_student_bill_id: 'b2', term_no: 2 },
      ],
      billing_student_bills: [
        { id: 'b1', status: 'partially_paid', final_amount: 3000, balance_amount: 3000 },
        { id: 'b2', status: 'paid', final_amount: 2500, balance_amount: 0 },
      ],
      billing_bill_instalments: [],
    });

    const ids = await term1PaidLearnerIds(svc as never, 'ty1');
    expect(ids.has('L1')).toBe(false);
  });

  it('clears an instalment learner who has paid exactly instalment 1', async () => {
    const svc = makeFakeSupabase({
      tms_fee_bill: [
        { person_id: 'L2', status: 'generated', billing_student_bill_id: 'b3', term_no: 1 },
      ],
      billing_student_bills: [
        { id: 'b3', status: 'partially_paid', final_amount: 5500, balance_amount: 2750 },
      ],
      billing_bill_instalments: [
        { bill_id: 'b3', amount: 2750, due_date: '2026-07-01', sequence_no: 1 },
        { bill_id: 'b3', amount: 2750, due_date: '2026-08-01', sequence_no: 2 },
      ],
    });

    const ids = await term1PaidLearnerIds(svc as never, 'ty1');
    expect(ids.has('L2')).toBe(true);
  });

  it('throws rather than returning a partial set when a chunk errors', async () => {
    const svc = makeFakeSupabase(
      {
        tms_fee_bill: [
          { person_id: 'L3', status: 'generated', billing_student_bill_id: 'b4', term_no: 1 },
        ],
        billing_bill_instalments: [],
      },
      { errors: { billing_student_bills: { message: 'boom' } } },
    );

    await expect(term1PaidLearnerIds(svc as never, 'ty1')).rejects.toBeTruthy();
  });

  it('warns and falls back to the whole-bill rule when billing_bill_instalments is 42P01', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = makeFakeSupabase(
      {
        tms_fee_bill: [
          { person_id: 'L4', status: 'generated', billing_student_bill_id: 'b5', term_no: 1 },
        ],
        billing_student_bills: [
          { id: 'b5', status: 'paid', final_amount: 3000, balance_amount: 0 },
        ],
      },
      { errors: { billing_bill_instalments: { message: 'relation does not exist', code: '42P01' } } },
    );

    const ids = await term1PaidLearnerIds(svc as never, 'ty1');
    expect(ids.has('L4')).toBe(true); // whole-bill rule: status paid
    expect(warnSpy).toHaveBeenCalled();
  });
});
