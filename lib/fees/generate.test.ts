import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeFakeSupabase } from './__testing__/fake-supabase';
import { generateBills } from './generate';

function flatFixture(overrides: Record<string, unknown[]> = {}) {
  return makeFakeSupabase({
    tms_fee_structure: [{
      id: 'fs1',
      name: 'Transport Fees Test',
      status: 'active',
      audience: 'student',
      fee_mode: 'flat',
      transport_year_id: 'ty1',
      institution_ids: null,
      staff_role_keys: null,
      lifecycle_statuses: null,
    }],
    tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
    tms_fee_structure_term: [
      { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
      { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-08-31', year_band_id: null },
    ],
    tms_billable_learner: [
      { id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null },
      { id: 'L2', institution_id: 'i1', admission_year_id: null, academic_year_id: null },
    ],
    admission_years: [],
    tms_fee_override: [],
    tms_fee_bill: [],
    ...overrides,
  });
}

describe('generateBills — flat dry run (characterization)', () => {
  // Pinned so `p.bornOverdue` below stays deterministic: the fixture's terms
  // are due 2026-07-31 and 2026-08-31, so the assertion only holds while
  // today falls between those two dates. Pin rather than weaken it.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T06:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('previews every applicable learner against every term', async () => {
    const svc = flatFixture();
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1',
      mode: 'dry_run',
      actorId: 'admin-1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p = res.data as Record<string, unknown>;

    expect(p.mode).toBe('dry_run');
    expect(p.audience).toBe('student');
    expect(p.feeMode).toBe('flat');
    expect(p.applicable).toBe(2);
    expect(p.learnerCount).toBe(2);
    expect(p.staffCount).toBe(0);
    expect(p.unresolved).toBe(0);
    expect(p.overridden).toBe(0);
    expect(p.termsPerPerson).toBe(2);
    expect(p.totalPerPerson).toBe(5500);
    // Was 4 (2 learners x 2 terms). Learner bills are now one bill per person
    // per year with the terms as instalments, so the counter counts BILLS: 2.
    expect(p.toGeneratePairs).toBe(2);      // 2 learners x 1 bill each
    expect(p.alreadyBilledPairs).toBe(0);
    expect(p.conflictCount).toBe(0);
    expect(p.staffDeferred).toBe(false);
    // Term 1 (2026-07-31) is past; Term 2 (2026-08-31) is not. 2 learners.
    expect(p.bornOverdue).toBe(2);
  });

  it('counts already-billed pairs instead of re-billing them', async () => {
    const svc = flatFixture({
      tms_fee_bill: [{ person_id: 'L1', term_no: 1 }],
    });
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1',
      mode: 'dry_run',
      actorId: 'admin-1',
    });
    if (!res.ok) throw new Error('expected ok');
    const p = res.data as Record<string, unknown>;
    // Learner idempotency is person-level now: L1's single term-1 ledger row
    // marks the WHOLE person as billed, so 1 already-billed and only L2 (one
    // bill) left to generate. Was 1 / 3 under the per-term grain.
    expect(p.alreadyBilledPairs).toBe(1);
    expect(p.toGeneratePairs).toBe(1);
  });

  it('rejects a structure that is not active', async () => {
    const svc = makeFakeSupabase({
      tms_fee_structure: [{ id: 'fs1', status: 'draft', audience: 'student', fee_mode: 'flat', transport_year_id: 'ty1' }],
    });
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: 'admin-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
    expect(res.error).toContain('Activate the fee structure');
  });

  it('404s an unknown structure', async () => {
    const svc = makeFakeSupabase({ tms_fee_structure: [] });
    const res = await generateBills(svc as never, {
      feeStructureId: 'nope', mode: 'dry_run', actorId: 'admin-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it('fails loud when overrides cannot be loaded — never bills full price', async () => {
    const svc = makeFakeSupabase(
      {
        tms_fee_structure: [{
          id: 'fs1', name: 'T', status: 'active', audience: 'student', fee_mode: 'flat',
          transport_year_id: 'ty1', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null,
        }],
        tms_transport_year: [{ start_date: '2026-06-01' }],
        tms_fee_structure_term: [
          { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
        ],
        tms_billable_learner: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
        admission_years: [],
        tms_fee_bill: [],
      },
      { errors: { tms_fee_override: { message: 'gateway timeout' } } }
    );
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: 'admin-1',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(500);
    expect(res.error).toContain('override');
  });
});

describe('generateBills — orphan compensation', () => {
  it('deletes the money bill when the ledger insert fails', async () => {
    const svc = makeFakeSupabase(
      {
        tms_fee_structure: [{
          id: 'fs1', name: 'T', status: 'active', audience: 'student', fee_mode: 'flat',
          transport_year_id: 'ty1', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null,
        }],
        tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
        tms_fee_structure_term: [
          { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
        ],
        tms_billable_learner: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
        admission_years: [],
        tms_fee_override: [],
        tms_fee_bill: [],
        billing_categories: [{ id: 'cat1' }],
        academic_years: [],
      },
      { insertErrors: { tms_fee_bill: { message: 'duplicate key', code: '23505' } } }
    );

    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const out = res.data as { errors: number; learnerBilled: number };
    expect(out.learnerBilled).toBe(0);
    expect(out.errors).toBe(1);

    // The compensating delete must have been issued against the money table.
    const deletes = svc.calls.filter(
      (c) => c.table === 'billing_student_bills' && c.ops.some(([op]) => op === 'delete')
    );
    expect(deletes).toHaveLength(1);
  });
});

describe('generateBills — auto-only policies', () => {
  function conflictFixture() {
    return makeFakeSupabase({
      tms_fee_structure: [{
        id: 'fs1', name: 'T', status: 'active', audience: 'student', fee_mode: 'flat',
        transport_year_id: 'ty1', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null,
      }],
      tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
      tms_fee_structure_term: [
        { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
      ],
      tms_billable_learner: [
        { id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null },
        { id: 'L2', institution_id: 'i1', admission_year_id: null, academic_year_id: null },
      ],
      admission_years: [],
      tms_fee_override: [],
      // Both the ledger read and the conflict read hit this table. Returning a
      // row for L1 with a DIFFERENT structure id makes L1 a cross-structure
      // conflict while leaving them unbilled by fs1.
      tms_fee_bill: [{ person_id: 'L1', term_no: 99 }],
      billing_categories: [{ id: 'cat1' }],
      academic_years: [],
    });
  }

  it('reports conflicts but still bills them when skipConflicts is off (current manual behaviour)', async () => {
    const res = await generateBills(conflictFixture() as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: 'admin-1',
    });
    if (!res.ok) throw new Error('expected ok');
    const p = res.data as Record<string, unknown>;
    expect(p.conflictCount).toBe(1);
    expect(p.applicable).toBe(2);       // L1 is NOT removed
  });

  it('removes conflicted people from the cohort when skipConflicts is on', async () => {
    const res = await generateBills(conflictFixture() as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: null, skipConflicts: true,
    });
    if (!res.ok) throw new Error('expected ok');
    const p = res.data as Record<string, unknown>;
    expect(p.conflictsSkipped).toBe(1);
    expect(p.applicable).toBe(1);       // only L2 remains
  });

  it('writes no generation-run row when there is nothing to bill and skipEmptyRun is on', async () => {
    const svc = makeFakeSupabase({
      tms_fee_structure: [{
        id: 'fs1', name: 'T', status: 'active', audience: 'student', fee_mode: 'flat',
        transport_year_id: 'ty1', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null,
      }],
      tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
      tms_fee_structure_term: [
        { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
      ],
      tms_billable_learner: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
      admission_years: [],
      tms_fee_override: [],
      tms_fee_bill: [{ person_id: 'L1', term_no: 1 }],   // already billed
      billing_categories: [{ id: 'cat1' }],
      academic_years: [],
    });

    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: null, skipEmptyRun: true,
    });
    if (!res.ok) throw new Error('expected ok');
    const out = res.data as { runId: string | null; learnerBilled: number };
    expect(out.learnerBilled).toBe(0);
    expect(out.runId).toBeNull();

    const runInserts = svc.calls.filter(
      (c) => c.table === 'tms_fee_generation_run' && c.ops.some(([op]) => op === 'insert')
    );
    expect(runInserts).toHaveLength(0);
  });
});

describe('generateBills — learner bills are one bill with instalments', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T06:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function inserts(svc: ReturnType<typeof makeFakeSupabase>, table: string) {
    return svc.calls
      .filter((c) => c.table === table)
      .flatMap((c) => c.ops.filter(([op]) => op === 'insert').map(([, args]) => args[0]));
  }

  it('writes ONE billing_student_bills row per learner for a two-term structure', async () => {
    const svc = flatFixture();
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1',
      mode: 'generate',
      actorId: 'admin-1',
    });
    expect(res.ok).toBe(true);

    const bills = inserts(svc, 'billing_student_bills') as Array<Record<string, unknown>[]>;
    // Two learners in the fixture, two terms each -> 2 bills, not 4.
    expect(bills).toHaveLength(2);
    expect(bills[0][0].final_amount).toBe(5500);
    expect(bills[0][0].balance_amount).toBe(5500);
    expect(bills[0][0].due_date).toBe('2026-07-31');
  });

  it('writes every instalment of a bill in ONE array insert', async () => {
    // trg_bbi_validate_sum is deferrable: one row at a time fails the sum check.
    const svc = flatFixture();
    await generateBills(svc as never, { feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1' });

    const batches = inserts(svc, 'billing_bill_instalments') as Array<Record<string, unknown>[]>;
    expect(batches).toHaveLength(2); // one batch per learner
    expect(batches[0]).toHaveLength(2); // both instalments in that batch
    expect(batches[0].map((i) => i.sequence_no)).toEqual([1, 2]);
    expect(batches[0].map((i) => i.amount)).toEqual([3000, 2500]);
    expect(batches[0].map((i) => i.due_date)).toEqual(['2026-07-31', '2026-08-31']);
  });

  it('writes ONE tms_fee_bill row carrying the YEAR total, at term_no 1', async () => {
    // uq_tms_fee_bill_billing_student_bill forbids two ledger rows per bill.
    const svc = flatFixture();
    await generateBills(svc as never, { feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1' });

    const ledger = inserts(svc, 'tms_fee_bill') as Array<Record<string, unknown>[]>;
    expect(ledger).toHaveLength(2);
    expect(ledger[0][0].term_no).toBe(1);
    expect(ledger[0][0].amount).toBe(5500);
    expect(ledger[0][0].due_date).toBe('2026-07-31');
  });

  it('names the bill with the transport year and no term suffix', async () => {
    // The year must survive: term_number is NULL on transport bills and
    // transport_year_id is unreliable there, so this text is the only record.
    const svc = flatFixture();
    await generateBills(svc as never, { feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1' });
    const bills = inserts(svc, 'billing_student_bills') as Array<Record<string, unknown>[]>;
    expect(bills[0][0].bill_description).toBe('Transport Maintenance Fee - 2026-2027');
  });

  it('deletes the bill when the instalment insert fails, leaving no orphan', async () => {
    const failing = makeFakeSupabase(
      {
        tms_fee_structure: [{
          id: 'fs1', name: 'Transport Fees Test', status: 'active', audience: 'student',
          fee_mode: 'flat', transport_year_id: 'ty1', institution_ids: null,
          staff_role_keys: null, lifecycle_statuses: null,
        }],
        tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
        tms_fee_structure_term: [
          { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
          { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-08-31', year_band_id: null },
        ],
        tms_billable_learner: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
        admission_years: [],
        tms_fee_override: [],
        tms_fee_bill: [],
      },
      { insertErrors: { billing_bill_instalments: { message: 'sum mismatch' } } }
    );

    const res = await generateBills(failing as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.data as Record<string, unknown>).errors).toBe(1);
    expect((res.data as Record<string, unknown>).learnerBilled).toBe(0);
    // The money row must have been compensated away.
    const deletes = failing.calls.filter(
      (c) => c.table === 'billing_student_bills' && c.ops.some(([op]) => op === 'delete')
    );
    expect(deletes).toHaveLength(1);
  });

  it('skips a learner who already has ANY ledger row for the structure and year', async () => {
    // Idempotency is person-level now: a legacy learner with term 1 AND term 2
    // rows must not be re-billed as a single merged bill.
    const svc = flatFixture({ tms_fee_bill: [{ person_id: 'L1', term_no: 1 }, { person_id: 'L1', term_no: 2 }] });
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.data as Record<string, unknown>).learnerBilled).toBe(1); // only L2
    expect((res.data as Record<string, unknown>).skipped).toBe(1);
  });
});

describe('generateBills — partial legacy ledger is reported, not hidden', () => {
  // A learner billed under the OLD per-term grain can hold fewer ledger rows
  // than they have terms. Person-level idempotency skips them wholesale, and
  // their schedule is fixed at generation time, so they will never be topped
  // up. `underCovered` is the only signal an operator gets.
  it('counts a skipped learner whose ledger rows do not cover all their terms', async () => {
    const svc = flatFixture({ tms_fee_bill: [{ person_id: 'L1', term_no: 1 }] });
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: 'admin-1',
    });
    if (!res.ok) throw new Error('expected ok');
    const p = res.data as Record<string, unknown>;
    expect(p.alreadyBilledPairs).toBe(1);
    expect(p.underCovered).toBe(1);   // L1: 1 ledger row vs 2 resolved terms
  });

  it('counts nothing when the skipped learner is fully covered', async () => {
    const svc = flatFixture({
      tms_fee_bill: [{ person_id: 'L1', term_no: 1 }, { person_id: 'L1', term_no: 2 }],
    });
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'dry_run', actorId: 'admin-1',
    });
    if (!res.ok) throw new Error('expected ok');
    const p = res.data as Record<string, unknown>;
    expect(p.alreadyBilledPairs).toBe(1);
    expect(p.underCovered).toBe(0);
  });
});

describe('generateBills — tiered bill description', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T06:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins the transport year and the band label with a single separator', async () => {
    const svc = makeFakeSupabase({
      tms_fee_structure: [{
        id: 'fs1', name: 'Arts Self', status: 'active', audience: 'student',
        fee_mode: 'tiered', transport_year_id: 'ty1', institution_ids: null,
        staff_role_keys: null, lifecycle_statuses: null,
      }],
      tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
      tms_fee_structure_year_band: [{
        id: 'b1', fee_structure_id: 'fs1', band_order: 1, label: 'Year 1',
        study_years: [1], total_amount: 5500, split_count: 2,
      }],
      tms_fee_structure_term: [
        { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: 'b1' },
        { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-08-31', year_band_id: 'b1' },
      ],
      tms_billable_learner: [{ id: 'L1', institution_id: 'i1', admission_year_id: 'ad1', academic_year_id: null }],
      admission_years: [{ id: 'ad1', year: 2026 }],   // admitted 2026 -> study year 1 -> band b1
      tms_fee_override: [],
      tms_fee_bill: [],
      billing_categories: [{ id: 'cat1' }],
      academic_years: [],
    });

    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.data as Record<string, unknown>).learnerBilled).toBe(1);

    const bills = svc.calls
      .filter((c) => c.table === 'billing_student_bills')
      .flatMap((c) => c.ops.filter(([op]) => op === 'insert').map(([, args]) => args[0])) as Array<
      Record<string, unknown>[]
    >;
    expect(bills).toHaveLength(1);
    expect(bills[0][0].bill_description).toBe('Transport Maintenance Fee - 2026-2027 - Year 1');
  });
});

describe('generateBills — the bill academic year follows the transport year', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T06:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function fixture(academicYears: Array<Record<string, unknown>>) {
    return makeFakeSupabase({
      tms_fee_structure: [{
        id: 'fs1', name: 'Flat', status: 'active', audience: 'student', fee_mode: 'flat',
        transport_year_id: 'ty1', institution_ids: null, staff_role_keys: null, lifecycle_statuses: null,
      }],
      tms_transport_year: [{ start_date: '2026-06-01', name: '2026-2027' }],
      tms_fee_structure_term: [
        { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31', year_band_id: null },
      ],
      // The learner's PROFILE still points at last year's academic year.
      tms_billable_learner: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: 'ay-25' }],
      admission_years: [],
      tms_fee_override: [],
      tms_fee_bill: [],
      billing_categories: [{ id: 'cat1' }],
      academic_years: academicYears,
    });
  }

  async function billedAcademicYear(svc: ReturnType<typeof makeFakeSupabase>) {
    const res = await generateBills(svc as never, {
      feeStructureId: 'fs1', mode: 'generate', actorId: 'admin-1',
    });
    expect(res.ok).toBe(true);
    const bills = svc.calls
      .filter((c) => c.table === 'billing_student_bills')
      .flatMap((c) => c.ops.filter(([op]) => op === 'insert').map(([, args]) => args[0])) as Array<
      Record<string, unknown>[]
    >;
    expect(bills).toHaveLength(1);
    return bills[0][0];
  }

  it('stamps the transport year academic year, not the stale profile one', async () => {
    const row = await billedAcademicYear(fixture([
      { id: 'ay-25', institution_id: 'i1', academic_year_name: '2025-2026' },
      { id: 'ay-26', institution_id: 'i1', academic_year_name: '2026-2027' },
    ]));
    expect(row.academic_year_id).toBe('ay-26');
    expect(row.bill_description).toBe('Transport Maintenance Fee - 2026-2027');
  });

  it('falls back to the profile academic year when the institution has no row for this year', async () => {
    const row = await billedAcademicYear(fixture([
      { id: 'ay-25', institution_id: 'i1', academic_year_name: '2025-2026' },
      { id: 'ay-26-other', institution_id: 'i2', academic_year_name: '2026-2027' },
    ]));
    expect(row.academic_year_id).toBe('ay-25');
  });
});
