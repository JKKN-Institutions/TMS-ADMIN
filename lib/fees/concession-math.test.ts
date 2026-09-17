import { describe, it, expect } from 'vitest';
import {
  matchRule, targetTerms, targetTotal, rowTargets, hasPaymentActivity, classifyConcession, guardTarget,
  type ConcessionRule, type ExistingOverride, type LedgerState,
} from './concession-math';
import type { BillableTerm } from './resolve-terms';

const rule = (p: Partial<ConcessionRule>): ConcessionRule => ({
  id: 'r1', transport_year_id: 'y', kind: 'final_year', institution_id: 'pharm',
  admission_year: 2022, program_id: null, percent: 50, annual_amount: null,
  is_active: true, label: 'x', created_at: '2026-09-17T00:00:00Z', ...p,
});
const term = (term_no: number, amount: number): BillableTerm =>
  ({ term_no, term_label: `Term ${term_no}`, amount, due_date: `2026-0${term_no + 6}-31` });
const bill = (p: Partial<LedgerState>): LedgerState => ({
  feeBillId: 'fb', termNo: 1, ledgerAmount: 5500, ledgerStatus: 'generated',
  moneyBillId: 'sb', moneyFinal: 5500, moneyStatus: 'unpaid', paid: 0, pendingPayment: false, ...p,
});
const subject = { institution_id: 'pharm', admission_year: 2022, program_id: 'bpharm', scholarship_type: null };

describe('matchRule', () => {
  it('matches institution + admission year, ignoring program when rule has none', () => {
    expect(matchRule([rule({})], 'final_year', subject)?.id).toBe('r1');
  });
  it('requires program when the rule sets one', () => {
    expect(matchRule([rule({ program_id: 'pharmd' })], 'final_year', subject)).toBeNull();
  });
  it('skips inactive rules and picks the earliest created match', () => {
    const rules = [
      rule({ id: 'late', created_at: '2026-09-18T00:00:00Z' }),
      rule({ id: 'off', is_active: false, created_at: '2026-09-01T00:00:00Z' }),
      rule({ id: 'early', created_at: '2026-09-10T00:00:00Z' }),
    ];
    expect(matchRule(rules, 'final_year', subject)?.id).toBe('early');
  });
  it('scheme_75 matches on scholarship_type only', () => {
    const r = rule({ id: 's', kind: 'scheme_75', institution_id: null, admission_year: null, percent: null, annual_amount: 500 });
    expect(matchRule([r], 'scheme_75', { ...subject, scholarship_type: '7.5% SCHOLARSHIP' })?.id).toBe('s');
    expect(matchRule([r], 'scheme_75', { ...subject, scholarship_type: 'NOT APPLICABLE' })).toBeNull();
  });
});

describe('targetTerms', () => {
  it('final_year halves every term, rounded to the rupee', () => {
    expect(targetTerms(rule({}), [term(1, 3001), term(2, 2500)])).toEqual([
      { term_no: 1, billable: true, amount: 1501 },
      { term_no: 2, billable: true, amount: 1250 },
    ]);
  });
  it('scheme_75 charges the annual amount on the first term and drops the rest', () => {
    const r = rule({ kind: 'scheme_75', percent: null, annual_amount: 500 });
    expect(targetTerms(r, [term(2, 2500), term(1, 3000)])).toEqual([
      { term_no: 1, billable: true, amount: 500 },
      { term_no: 2, billable: false, amount: null },
    ]);
  });
  it('targetTotal sums billable terms only', () => {
    expect(targetTotal([{ term_no: 1, billable: true, amount: 500 }, { term_no: 2, billable: false, amount: null }])).toBe(500);
  });
});

describe('rowTargets', () => {
  it('no rows → empty map; one row carries the whole total', () => {
    expect(rowTargets('final_year', 2750, [])).toEqual(new Map());
    expect(rowTargets('scheme_75', 500, [bill({ feeBillId: 'a' })])).toEqual(new Map([['a', 500]]));
  });
  it('final_year splits legacy rows in proportion to ledger amounts, last row takes the remainder', () => {
    const rows = [bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 2500 }), bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 3000 })];
    expect(rowTargets('final_year', 2750, rows)).toEqual(new Map([['a', 1500], ['b', 1250]]));
    expect(rowTargets('final_year', 2751, rows)).toEqual(new Map([['a', 1501], ['b', 1250]]));
  });
  it('final_year keeps the same split once already applied (proportions unchanged)', () => {
    const rows = [bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 1500 }), bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 1250 })];
    expect(rowTargets('final_year', 2750, rows)).toEqual(new Map([['a', 1500], ['b', 1250]]));
  });
  it('final_year cannot split zero-amount rows', () => {
    const rows = [bill({ feeBillId: 'a', ledgerAmount: 0 }), bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 0 })];
    expect(rowTargets('final_year', 2750, rows)).toBeNull();
  });
  it('scheme_75 keeps the lowest term and deletes the rest', () => {
    const rows = [bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 2500 }), bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 3000 })];
    expect(rowTargets('scheme_75', 500, rows)).toEqual(new Map([['a', 500], ['b', null]]));
  });
});

describe('hasPaymentActivity', () => {
  it('is true for receipts, pending payments, or any non-unpaid money status', () => {
    expect(hasPaymentActivity(bill({}))).toBe(false);
    expect(hasPaymentActivity(bill({ paid: 1 }))).toBe(true);
    expect(hasPaymentActivity(bill({ pendingPayment: true }))).toBe(true);
    expect(hasPaymentActivity(bill({ moneyStatus: 'partially_paid' }))).toBe(true);
    expect(hasPaymentActivity(bill({ moneyStatus: 'paid' }))).toBe(true);
  });
});

describe('classifyConcession', () => {
  const half = [{ term_no: 1, billable: true, amount: 2750 }];
  const halfOverride = (extra?: Partial<ExistingOverride>): ExistingOverride[] =>
    [{ term_no: 1, billable: true, amount: 2750, reason: null, concession_rule_id: null, ...extra }];
  const fy = (overrides: ExistingOverride[], ledger: LedgerState[]) =>
    classifyConcession({ kind: 'final_year', terms: half, total: 2750, overrides, ledger });
  it('no bill and matching overrides → applied', () => {
    expect(fy(halfOverride(), []).status).toBe('applied');
  });
  it('no bill and no overrides → needs_fix', () => {
    expect(fy([], []).status).toBe('needs_fix');
  });
  it('unpaid full bill → needs_fix', () => {
    expect(fy([], [bill({})]).status).toBe('needs_fix');
  });
  it('money already at target but ledger stale → needs_fix (PB22042 shape)', () => {
    expect(fy([], [bill({ moneyFinal: 2750, moneyStatus: 'paid', paid: 2750 })]).status).toBe('needs_fix');
  });
  it('fully aligned paid bill with overrides → applied', () => {
    expect(fy(halfOverride(), [bill({ ledgerAmount: 2750, moneyFinal: 2750, moneyStatus: 'paid', paid: 2750 })]).status).toBe('applied');
  });
  it('paid more than the concession → review with a reason (KAMALESH shape)', () => {
    const r = fy([], [bill({ moneyStatus: 'paid', paid: 5500 })]);
    expect(r.status).toBe('review');
    expect(r.reason).toContain('5500');
  });
  it('paid status without receipts, or a pending payment, on a wrong-amount bill → review', () => {
    expect(fy([], [bill({ moneyStatus: 'paid' })]).status).toBe('review');
    expect(fy([], [bill({ pendingPayment: true })]).status).toBe('review');
  });
  it('cancelled bill or missing money row → review', () => {
    expect(fy(halfOverride(), [bill({ ledgerStatus: 'cancelled' })]).status).toBe('review');
    expect(fy(halfOverride(), [bill({ moneyStatus: 'cancelled' })]).status).toBe('review');
    expect(fy(halfOverride(), [bill({ moneyBillId: null, moneyFinal: null, moneyStatus: null })]).status).toBe('review');
  });
  it('final_year legacy two-row unpaid ledger → needs_fix, then applied once split', () => {
    const before = [
      bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 3000, moneyFinal: 3000 }),
      bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 2500, moneyFinal: 2500 }),
    ];
    expect(fy(halfOverride(), before).status).toBe('needs_fix');
    const after = [
      bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 1500, moneyFinal: 1500 }),
      bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 1250, moneyFinal: 1250 }),
    ];
    expect(fy(halfOverride(), after).status).toBe('applied');
  });
  it('final_year zero-amount legacy rows → review', () => {
    const rows = [bill({ feeBillId: 'a', ledgerAmount: 0 }), bill({ feeBillId: 'b', termNo: 2, ledgerAmount: 0 })];
    expect(fy(halfOverride(), rows).status).toBe('review');
  });
  it('7.5%: unpaid legacy term-2 row → needs_fix; paid term-2 row → review', () => {
    const t = [{ term_no: 1, billable: true, amount: 500 }];
    const tOverride: ExistingOverride[] = [{ term_no: 1, billable: true, amount: 500, reason: null, concession_rule_id: null }];
    const t1 = bill({ feeBillId: 'a', termNo: 1, ledgerAmount: 3000, moneyFinal: 500, moneyStatus: 'paid', paid: 500 });
    const run = (ledger: LedgerState[]) =>
      classifyConcession({ kind: 'scheme_75', terms: t, total: 500, overrides: tOverride, ledger });
    expect(run([t1, bill({ feeBillId: 'b', termNo: 2, moneyFinal: 2500, ledgerAmount: 2500 })]).status).toBe('needs_fix');
    expect(run([t1, bill({ feeBillId: 'b', termNo: 2, moneyFinal: 2500, ledgerAmount: 2500, paid: 2500, moneyStatus: 'paid' })]).status).toBe('review');
  });

  describe('manual fee exceptions are never overwritten', () => {
    it('a manual ZERO FEE override differing from the target → review, not needs_fix', () => {
      const r = fy([{ term_no: 1, billable: true, amount: 0, reason: 'ZERO FEE - hardship case', concession_rule_id: null }], []);
      expect(r.status).toBe('review');
      expect(r.reason).toContain('manual fee exception');
      expect(r.reason).toContain('ZERO FEE');
    });
    it('a legacy concession override (known prefix, no rule id, stale amount) is not manual → needs_fix', () => {
      const r = fy([{ term_no: 1, billable: true, amount: 5500, reason: 'FINAL-YEAR BATCH CLOSURE - old label - 2026-01-01', concession_rule_id: null }], []);
      expect(r.status).toBe('needs_fix');
    });
    it('a manual override already equal to the target is not blocked', () => {
      const r = fy([{ term_no: 1, billable: true, amount: 2750, reason: 'Term 2 transport fee removed on request', concession_rule_id: null }], []);
      expect(r.status).toBe('applied');
    });
    it('a manual override on a term outside `terms` is ignored', () => {
      const r = fy([{ term_no: 2, billable: false, amount: null, reason: 'ZERO FEE - unrelated term', concession_rule_id: null }], []);
      expect(r.status).toBe('needs_fix'); // no bill, no matching override on term 1 → normal needs_fix path
    });
  });
});

describe('guardTarget', () => {
  it('a zero or negative total is not applicable', () => {
    expect(guardTarget('final_year', 0, 5500)).toBe('Concession amount is Rs 0 — handle manually');
    expect(guardTarget('final_year', -1, 5500)).toBe('Concession amount is Rs 0 — handle manually');
  });
  it('a scheme_75 amount above the full fee is not applicable', () => {
    expect(guardTarget('scheme_75', 6000, 5500)).toBe('Scheme amount Rs 6000 is more than the full fee Rs 5500');
  });
  it('a final_year total above the full fee is fine (percent caps it at 100)', () => {
    expect(guardTarget('final_year', 6000, 5500)).toBeNull();
  });
  it('an ordinary positive, in-range total is fine', () => {
    expect(guardTarget('scheme_75', 500, 5500)).toBeNull();
    expect(guardTarget('final_year', 2750, 5500)).toBeNull();
  });
});
