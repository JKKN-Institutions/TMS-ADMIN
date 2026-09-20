import { describe, it, expect } from 'vitest';
import { collectionByMode, paymentModeFilterOptions, PAYMENT_MODE_LABELS, NO_PAYMENT_MODE } from './payment-mode';
import type { TransportBillRow } from './bills';

function row(over: Partial<TransportBillRow> = {}): TransportBillRow {
  return {
    id: 'r', person_id: 'p', person_type: 'learner', person_name: '—', code: null,
    institution_id: null, institution_name: null, department_id: null, department_name: null,
    route_id: null, route_number: null, route_name: null,
    structure_id: 's', structure_name: null, transport_year_id: 'y', year_name: null,
    academic_year_id: null, academic_year_name: null, term_no: 1,
    amount: 0, due_date: '2026-12-31', paid_amount: 0, pending_amount: 0, status: 'unpaid',
    payment_date: null, billing_student_bill_id: null,
    payment_mode: null, payment_modes: [], receipt_number: null, payment_reference: null,
    ...over,
  };
}

describe('paymentModeFilterOptions', () => {
  it('offers only the modes present in the rows', () => {
    const opts = paymentModeFilterOptions([
      row({ payment_mode: 'cash' }),
      row({ payment_mode: 'online' }),
    ]);
    expect(opts.map((o) => o.value)).toEqual(['cash', 'online']);
  });

  it('puts cash first — it is the default mode here, not an afterthought', () => {
    const opts = paymentModeFilterOptions([row({ payment_mode: 'online' }), row({ payment_mode: 'cash' })]);
    expect(opts[0].value).toBe('cash');
  });

  it('appends a "Not recorded" bucket last when some bill has no receipt', () => {
    const opts = paymentModeFilterOptions([row({ payment_mode: 'cash' }), row({ payment_mode: null })]);
    expect(opts.at(-1)).toEqual({ label: 'Not recorded', value: NO_PAYMENT_MODE });
  });

  it('omits the bucket when every row has a mode', () => {
    const opts = paymentModeFilterOptions([row({ payment_mode: 'cash' })]);
    expect(opts.map((o) => o.value)).not.toContain(NO_PAYMENT_MODE);
  });

  it('labels every option', () => {
    const opts = paymentModeFilterOptions([row({ payment_mode: 'bank_transfer' })]);
    expect(opts[0].label).toBe(PAYMENT_MODE_LABELS.bank_transfer);
  });
});

describe('collectionByMode', () => {
  it('splits collected money by mode and counts distinct people', () => {
    const out = collectionByMode([
      row({ person_id: 'a', payment_mode: 'cash', paid_amount: 2500, status: 'paid' }),
      row({ person_id: 'a', payment_mode: 'cash', paid_amount: 2500, status: 'paid' }), // 2nd term
      row({ person_id: 'b', payment_mode: 'online', paid_amount: 5000, status: 'paid' }),
    ]);
    expect(out).toEqual([
      { mode: 'cash', label: 'Cash', collected: 5000, bills: 2, people: 1 },
      { mode: 'online', label: 'Online', collected: 5000, bills: 1, people: 1 },
    ]);
  });

  it('counts COLLECTED money, not billed — so it reconciles with the Collected KPI', () => {
    // A partially paid bill contributes only what was actually received.
    const out = collectionByMode([
      row({ payment_mode: 'cash', amount: 5000, paid_amount: 2000, pending_amount: 3000, status: 'partially_paid' }),
    ]);
    expect(out[0].collected).toBe(2000);
  });

  it('excludes cancelled bills, matching summarizeBills', () => {
    const out = collectionByMode([
      row({ payment_mode: 'cash', paid_amount: 2500, status: 'cancelled' }),
    ]);
    expect(out).toEqual([]);
  });

  it('ignores rows with no mode instead of inventing a bucket for them', () => {
    const out = collectionByMode([
      row({ payment_mode: null, paid_amount: 0, pending_amount: 2500 }),
      row({ payment_mode: 'cash', paid_amount: 2500, status: 'paid' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].mode).toBe('cash');
  });

  it('sums to the total collected across every mode', () => {
    const rows = [
      row({ person_id: 'a', payment_mode: 'cash', paid_amount: 2500, status: 'paid' }),
      row({ person_id: 'b', payment_mode: 'online', paid_amount: 1500, status: 'partially_paid' }),
      row({ person_id: 'c', payment_mode: 'dd', paid_amount: 3000, status: 'paid' }),
    ];
    const total = collectionByMode(rows).reduce((s, m) => s + m.collected, 0);
    expect(total).toBe(7000);
  });
});
