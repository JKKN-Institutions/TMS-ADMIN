import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStaffFeeBillRow } from './staff-bill';

vi.mock('./applicability', () => ({ resolveApplicablePeople: vi.fn() }));

import { generateStaffBill, resolveStaffBillPlan } from './staff-bill';
import { resolveApplicablePeople } from './applicability';

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

  it('defaults to staff_deferred when no status is given', () => {
    expect(buildStaffFeeBillRow(base).status).toBe('staff_deferred');
  });

  it('writes a payable generated row when status is given', () => {
    expect(buildStaffFeeBillRow({ ...base, status: 'generated' }).status).toBe('generated');
  });

  it('keeps billing_student_bill_id null even for a payable row', () => {
    expect(buildStaffFeeBillRow({ ...base, status: 'generated' }).billing_student_bill_id).toBeNull();
  });
});

type Result = { data?: unknown; error?: unknown };

/** Chainable AND thenable stand-in for the Supabase query builder. */
function makeBuilder(result: Result, onInsert?: (rows: unknown[]) => Result) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.is = () => b;
  b.order = () => b;
  b.maybeSingle = async () => result;
  b.insert = (rows: unknown[]) => {
    const r = onInsert ? onInsert(rows) : { error: null };
    return { then: (resolve: (v: Result) => void) => resolve(r) };
  };
  b.then = (resolve: (v: Result) => void) => resolve(result);
  return b;
}

function makeSvc(cfg: {
  structures?: Result;
  terms?: Result;
  category?: Result;
  onInsert?: (rows: unknown[]) => Result;
}) {
  const insertedRows: Record<string, unknown>[] = [];
  const svc = {
    from: (table: string) => {
      if (table === 'tms_fee_structure') return makeBuilder(cfg.structures ?? { data: [], error: null });
      if (table === 'tms_fee_structure_term') return makeBuilder(cfg.terms ?? { data: [], error: null });
      if (table === 'billing_categories') return makeBuilder(cfg.category ?? { data: { id: 'cat-1' }, error: null });
      if (table === 'tms_fee_bill') {
        return makeBuilder({ data: null, error: null }, (rows) => {
          insertedRows.push(...(rows as Record<string, unknown>[]));
          return cfg.onInsert ? cfg.onInsert(rows) : { error: null };
        });
      }
      return makeBuilder({ data: [], error: null });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: svc as any, insertedRows };
}

const STRUCTURE = {
  id: 'fs-1', audience: 'staff', institution_ids: [], staff_role_keys: [], lifecycle_statuses: null,
};
const TERMS = [
  { term_no: 1, amount: 3000, due_date: '2026-08-01' },
  { term_no: 2, amount: 2750, due_date: '2026-11-01' },
];
const OPTS = { staffId: 's1', transportYearId: 'ty1' };

function personMatches() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(resolveApplicablePeople).mockResolvedValue([{ person_id: 's1' } as any]);
}

describe('generateStaffBill', () => {
  beforeEach(() => { vi.mocked(resolveApplicablePeople).mockReset(); });

  it('returns no_structure when no staff fee structure exists', async () => {
    const { svc } = makeSvc({ structures: { data: [], error: null } });
    expect(await generateStaffBill(svc, OPTS)).toEqual({ billingStatus: 'no_structure', inserted: 0 });
  });

  it('returns no_structure when the staffer is in no applicable population', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(resolveApplicablePeople).mockResolvedValue([{ person_id: 'someone-else' } as any]);
    const { svc } = makeSvc({ structures: { data: [STRUCTURE], error: null } });
    expect(await generateStaffBill(svc, OPTS)).toEqual({ billingStatus: 'no_structure', inserted: 0 });
  });

  it('returns no_structure when the matched structure has no terms', async () => {
    personMatches();
    const { svc } = makeSvc({ structures: { data: [STRUCTURE], error: null }, terms: { data: [], error: null } });
    expect(await generateStaffBill(svc, OPTS)).toEqual({ billingStatus: 'no_structure', inserted: 0 });
  });

  it('returns error when the structure query fails', async () => {
    const { svc } = makeSvc({ structures: { data: null, error: { message: 'boom' } } });
    expect(await generateStaffBill(svc, OPTS)).toEqual({ billingStatus: 'error', inserted: 0 });
  });

  it('returns error when the terms query fails', async () => {
    personMatches();
    const { svc } = makeSvc({
      structures: { data: [STRUCTURE], error: null },
      terms: { data: null, error: { message: 'boom' } },
    });
    expect(await generateStaffBill(svc, OPTS)).toEqual({ billingStatus: 'error', inserted: 0 });
  });

  it('bills one row per term on the happy path', async () => {
    personMatches();
    const { svc, insertedRows } = makeSvc({
      structures: { data: [STRUCTURE], error: null }, terms: { data: TERMS, error: null },
    });
    expect(await generateStaffBill(svc, OPTS)).toEqual({ billingStatus: 'billed', inserted: 2 });
    expect(insertedRows).toHaveLength(2);
  });

  it('writes staff rows that can never reference a shared learner bill', async () => {
    personMatches();
    const { svc, insertedRows } = makeSvc({
      structures: { data: [STRUCTURE], error: null }, terms: { data: TERMS, error: null },
    });
    await generateStaffBill(svc, OPTS);
    for (const row of insertedRows) {
      expect(row.person_type).toBe('staff');
      expect(row.billing_student_bill_id).toBeNull();
      expect(row.status).toBe('staff_deferred');
      expect(row.person_id).toBe('s1');
      expect(row.transport_year_id).toBe('ty1');
    }
  });

  it('treats 23505 as already billed rather than an error, and does not double count', async () => {
    personMatches();
    const { svc } = makeSvc({
      structures: { data: [STRUCTURE], error: null },
      terms: { data: TERMS, error: null },
      onInsert: () => ({ error: { code: '23505' } }),
    });
    expect(await generateStaffBill(svc, OPTS)).toEqual({ billingStatus: 'billed', inserted: 0 });
  });

  it('stops with error and reports partial progress on a hard insert failure', async () => {
    personMatches();
    let n = 0;
    const { svc } = makeSvc({
      structures: { data: [STRUCTURE], error: null },
      terms: { data: TERMS, error: null },
      onInsert: () => { n += 1; return n === 1 ? { error: null } : { error: { code: '42501' } }; },
    });
    expect(await generateStaffBill(svc, OPTS)).toEqual({ billingStatus: 'error', inserted: 1 });
  });
});

describe('resolveStaffBillPlan', () => {
  beforeEach(() => { vi.mocked(resolveApplicablePeople).mockReset(); });

  it('reports not billable when no active staff structure exists', async () => {
    const { svc } = makeSvc({ structures: { data: [], error: null } });
    expect(await resolveStaffBillPlan(svc, OPTS)).toEqual({ billable: false, reason: 'no_structure' });
  });

  it('reports not billable when the structure exists but has ZERO terms', async () => {
    // This is the live production state: one active staff structure, no terms.
    personMatches();
    const { svc } = makeSvc({
      structures: { data: [STRUCTURE], error: null },
      terms: { data: [], error: null },
    });
    expect(await resolveStaffBillPlan(svc, OPTS)).toEqual({ billable: false, reason: 'no_structure' });
  });

  it('reports not billable when the staffer is in no applicable population', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(resolveApplicablePeople).mockResolvedValue([{ person_id: 'someone-else' } as any]);
    const { svc } = makeSvc({ structures: { data: [STRUCTURE], error: null } });
    expect(await resolveStaffBillPlan(svc, OPTS)).toEqual({ billable: false, reason: 'no_structure' });
  });

  it('reports error (not no_structure) when the structure query fails', async () => {
    const { svc } = makeSvc({ structures: { data: null, error: { message: 'boom' } } });
    expect(await resolveStaffBillPlan(svc, OPTS)).toEqual({ billable: false, reason: 'error' });
  });

  it('reports error when the terms query fails', async () => {
    personMatches();
    const { svc } = makeSvc({
      structures: { data: [STRUCTURE], error: null },
      terms: { data: null, error: { message: 'boom' } },
    });
    expect(await resolveStaffBillPlan(svc, OPTS)).toEqual({ billable: false, reason: 'error' });
  });

  it('reports billable with the structure id and every term on the happy path', async () => {
    personMatches();
    const { svc } = makeSvc({
      structures: { data: [STRUCTURE], error: null },
      terms: { data: TERMS, error: null },
    });
    expect(await resolveStaffBillPlan(svc, OPTS)).toEqual({
      billable: true,
      feeStructureId: 'fs-1',
      terms: TERMS,
    });
  });

  it('agrees with generateStaffBill: not billable means nothing gets inserted', async () => {
    // The cron probes with this resolver and then bills with generateStaffBill.
    // If they could ever disagree, a staffer would lose their role for a bill
    // that was never going to generate.
    personMatches();
    const mk = () => makeSvc({
      structures: { data: [STRUCTURE], error: null },
      terms: { data: [], error: null },
    });
    const plan = await resolveStaffBillPlan(mk().svc, OPTS);
    const { svc, insertedRows } = mk();
    const bill = await generateStaffBill(svc, OPTS);
    expect(plan.billable).toBe(false);
    expect(bill).toEqual({ billingStatus: 'no_structure', inserted: 0 });
    expect(insertedRows).toHaveLength(0);
  });
});
