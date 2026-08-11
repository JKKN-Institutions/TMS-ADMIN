import { describe, it, expect } from 'vitest';
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
