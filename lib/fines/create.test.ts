import { describe, it, expect } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import { previewFines, createFines } from './create';

const YEAR = 'year-1';

const baseData = () => ({
  learners_profiles: [
    {
      id: 'p1',
      first_name: 'YOKESH',
      last_name: 'K',
      roll_number: 'EI23054',
      institution_id: 'inst-1',
      transport_stop_id: 'stop-a',
      academic_year_id: 'ay-1',
    },
    {
      id: 'p2',
      first_name: 'NOSTOP',
      last_name: 'X',
      roll_number: 'X01',
      institution_id: 'inst-1',
      transport_stop_id: null,
      academic_year_id: 'ay-1',
    },
  ],
  tms_fine_stop_rate: [{ stop_id: 'stop-a', fine_amount: 500 }],
  tms_route_stop: [{ id: 'stop-a', stop_name: 'EADAPPADI', route_id: 'r1' }],
  tms_route: [{ id: 'r1', route_number: '10' }],
  billing_categories: [{ id: 'cat-1', category_name: 'Transport Fee' }],
  billing_student_bills: [],
  tms_fee_fine: [],
});

const input = (over: Record<string, unknown> = {}) => ({
  transportYearId: YEAR,
  personIds: ['p1', 'p2'],
  dueDate: '2026-09-04',
  reason: 'Late payment',
  notify: false,
  idempotencyKey: 'req-1',
  actorId: 'admin-1',
  ...over,
});

describe('previewFines', () => {
  it('prices resolvable learners and reports the rest with a reason', async () => {
    const svc = makeFakeSupabase(baseData());
    const out = await previewFines(svc as never, { transportYearId: YEAR, personIds: ['p1', 'p2'] });

    const p1 = out.candidates.find((c) => c.person_id === 'p1');
    const p2 = out.candidates.find((c) => c.person_id === 'p2');
    expect(p1?.amount).toBe(500);
    expect(p1?.stop_name).toBe('EADAPPADI');
    expect(p2?.amount).toBeNull();
    expect(p2?.skip_reason).toBe('no_stop');
    expect(out.totalAmount).toBe(500);
  });

  it('writes nothing', async () => {
    const svc = makeFakeSupabase(baseData());
    await previewFines(svc as never, { transportYearId: YEAR, personIds: ['p1'] });
    expect(svc.calls.some((c) => c.ops.some(([op]) => op === 'insert'))).toBe(false);
  });
});

describe('createFines', () => {
  it('writes the money row and the ledger row, and skips the unresolvable learner', async () => {
    const svc = makeFakeSupabase(baseData());
    const out = await createFines(svc as never, input());

    expect(out.created).toBe(1);
    expect(out.totalAmount).toBe(500);
    expect(out.skipped).toEqual([{ person_id: 'p2', person_name: 'NOSTOP X', reason: 'no_stop' }]);

    const inserts = svc.calls.filter((c) => c.ops.some(([op]) => op === 'insert'));
    expect(inserts.map((c) => c.table)).toEqual(['billing_student_bills', 'tms_fee_fine']);
  });

  it('never raises a fine without its ledger row — the money row is deleted on ledger failure', async () => {
    const svc = makeFakeSupabase(baseData(), {
      insertErrors: { tms_fee_fine: { message: 'ledger down' } },
    });
    const out = await createFines(svc as never, input({ personIds: ['p1'] }));

    expect(out.created).toBe(0);
    expect(out.errors).toBe(1);
    expect(
      svc.calls.some((c) => c.table === 'billing_student_bills' && c.ops.some(([op]) => op === 'delete'))
    ).toBe(true);
  });

  it('counts a duplicate idempotency key as a duplicate, never as created', async () => {
    const svc = makeFakeSupabase(baseData(), {
      insertErrors: { tms_fee_fine: { message: 'duplicate key', code: '23505' } },
    });
    const out = await createFines(svc as never, input({ personIds: ['p1'] }));

    expect(out.created).toBe(0);
    expect(out.duplicates).toBe(1);
    expect(out.errors).toBe(0);
  });

  it('fails loudly when the fine sheet cannot be read, rather than fining nobody quietly', async () => {
    const svc = makeFakeSupabase(baseData(), {
      errors: { tms_fine_stop_rate: { message: 'boom' } },
    });
    await expect(createFines(svc as never, input())).rejects.toThrow();
  });
});
