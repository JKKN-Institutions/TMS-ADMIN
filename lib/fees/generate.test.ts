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
    learners_profiles: [
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
    expect(p.toGeneratePairs).toBe(4);      // 2 learners x 2 terms
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
    expect(p.alreadyBilledPairs).toBe(1);
    expect(p.toGeneratePairs).toBe(3);
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
        learners_profiles: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
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
        learners_profiles: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
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
      learners_profiles: [
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
      learners_profiles: [{ id: 'L1', institution_id: 'i1', admission_year_id: null, academic_year_id: null }],
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
