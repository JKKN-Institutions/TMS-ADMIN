import { describe, it, expect } from 'vitest';
import { buildStaffFeeBillRow } from './staff-bill';

describe('buildStaffFeeBillRow', () => {
  const base = {
    runId: null,
    feeStructureId: 'fs-1',
    transportYearId: 'ty-1',
    staffId: 'staff-1',
    categoryId: 'cat-1',
    term: { term_no: 2, amount: 2750, due_date: '2026-08-01' },
  };

  it('produces the exact tms_fee_bill staff row shape', () => {
    expect(buildStaffFeeBillRow(base)).toEqual({
      generation_run_id: null,
      fee_structure_id: 'fs-1',
      transport_year_id: 'ty-1',
      person_id: 'staff-1',
      person_type: 'staff',
      term_no: 2,
      amount: 2750,
      due_date: '2026-08-01',
      billing_category_id: 'cat-1',
      billing_student_bill_id: null,
      status: 'staff_deferred',
    });
  });

  it('never links a shared billing_student_bills row (staff cannot exist there)', () => {
    expect(buildStaffFeeBillRow(base).billing_student_bill_id).toBeNull();
  });

  it('coerces a numeric-string amount to a number', () => {
    const row = buildStaffFeeBillRow({
      ...base,
      term: { term_no: 1, amount: '3000' as unknown as number, due_date: '2026-08-01' },
    });
    expect(row.amount).toBe(3000);
    expect(typeof row.amount).toBe('number');
  });

  it('carries the generation run id when present', () => {
    expect(buildStaffFeeBillRow({ ...base, runId: 'run-9' }).generation_run_id).toBe('run-9');
  });
});
