import { describe, it, expect, vi } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import { raiseCheckFines, type FineDeps } from './fines';
import type { LearnerFeeFactsRow } from './fee-facts';

const CHECK = { id: 'C', route_id: 'R1', check_date: '2026-09-23' };
const ON = [{ settings_data: { enabled: true, enabled_at: '2026-09-22T00:00:00.000Z', unpaid_amount: 500, no_booking_amount: 200, fine_due_days: 7 } }];

function svcWith(settings: unknown[]) {
  return makeFakeSupabase({
    admin_settings: settings,
    tms_route_check_person: [
      { id: 'P1', check_id: 'C', person_kind: 'learner', learner_id: 'L1' },
      { id: 'P2', check_id: 'C', person_kind: 'staff', staff_id: 'S1' },
    ],
  });
}

/**
 * `readFineIdsByKeys` and `createFines` share a mutable `existingKeys` set that
 * models the real tms_fee_fine table: createFines' default mock "writes" a row
 * (adds the key) exactly like the real insert would, and readFineIdsByKeys
 * "reads" it back from the same set. That lets a test express "this learner
 * already has a fine" (seed the set before calling) independently from
 * "createFines just raised one" (the default mock populates the set itself),
 * which the module's I1 pre-check / I2a batch-then-read-back design requires.
 */
function deps(over: Partial<FineDeps> & { seedExistingKeys?: string[] } = {}): Partial<FineDeps> {
  const { seedExistingKeys, ...rest } = over;
  const existingKeys = new Set<string>(seedExistingKeys ?? []);
  let fineSeq = 0;

  const defaultCreateFines: FineDeps['createFines'] = vi.fn(async (_svc, input) => {
    for (const pid of input.personIds) existingKeys.add(`${input.idempotencyKey}:${pid}`);
    return { created: input.personIds.length, totalAmount: input.personIds.length * (input.fixedAmount ?? 0), skipped: [], duplicates: 0, errors: 0 };
  });

  const defaultReadFineIdsByKeys: FineDeps['readFineIdsByKeys'] = vi.fn(async (_svc, keys) => {
    const map = new Map<string, string>();
    for (const k of keys) if (existingKeys.has(k)) map.set(k, `fine-${++fineSeq}`);
    return map;
  });

  const defaultLoadLearnerFeeFacts: FineDeps['loadLearnerFeeFacts'] = vi.fn(async () => ({
    yearId: 'Y',
    facts: new Map<string, LearnerFeeFactsRow>([['L1', { mark: 'unpaid', term1DueDate: '2026-07-31', runningNoticeExpiresAt: null, hasBill: true }]]),
  }));

  const defaultLoadBookingRoutes: FineDeps['loadBookingRoutes'] = vi.fn(async () => new Map<string, string[]>());
  const defaultLoadExceptionDates: FineDeps['loadExceptionDates'] = vi.fn(async () => new Set<string>());
  const defaultLogSystemActivity: FineDeps['logSystemActivity'] = vi.fn(async () => {});

  return {
    now: () => new Date('2026-09-23T04:00:00.000Z'),
    loadLearnerFeeFacts: defaultLoadLearnerFeeFacts,
    loadBookingRoutes: defaultLoadBookingRoutes,
    loadExceptionDates: defaultLoadExceptionDates,
    createFines: defaultCreateFines,
    logSystemActivity: defaultLogSystemActivity,
    readFineIdsByKeys: defaultReadFineIdsByKeys,
    ...rest,
  };
}

describe('raiseCheckFines', () => {
  it('does nothing but stamp a note when fines are off', async () => {
    const d = deps();
    const out = await raiseCheckFines(svcWith([]) as never, CHECK, 'actor', d);
    expect(out).toMatchObject({ enabled: false, raised: 0 });
    expect(d.createFines).not.toHaveBeenCalled();
    expect(d.readFineIdsByKeys).not.toHaveBeenCalled();
  });

  it('raises both fines for an unpaid, unbooked learner with the shared keys and fixed amounts; never staff', async () => {
    const d = deps();
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(out.raised).toBe(2);
    expect(d.createFines).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      personIds: ['L1'], idempotencyKey: 'maintenance-unpaid:Y', fixedAmount: 500, kind: 'maintenance_unpaid', dueDate: '2026-09-30', actorId: 'actor',
    }));
    expect(d.createFines).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      personIds: ['L1'], idempotencyKey: 'no-booking:2026-09-23', fixedAmount: 200, kind: 'no_booking',
    }));
    expect(d.createFines).toHaveBeenCalledTimes(2);
  });

  it('does not fine a learner whose fee is paid, and skips a booking on another bus', async () => {
    const d = deps({
      loadBookingRoutes: vi.fn(async () => new Map([['L1', ['R9']]])),
      loadLearnerFeeFacts: vi.fn(async () => ({ yearId: 'Y', facts: new Map<string, LearnerFeeFactsRow>([['L1', { mark: 'paid', term1DueDate: null, runningNoticeExpiresAt: null, hasBill: true }]]) })),
    });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(d.createFines).not.toHaveBeenCalled();
    expect(out.skipped).toEqual(expect.arrayContaining([
      { personId: 'L1', rule: 'booking', note: 'booked_other_bus' },
      { personId: 'L1', rule: 'fee', note: 'not_unpaid' },
    ]));
  });

  it('skips the booking fine on a holiday / non-service day (not_service_day)', async () => {
    const d = deps({ loadExceptionDates: vi.fn(async () => new Set([CHECK.check_date])) });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(out.skipped).toEqual(expect.arrayContaining([
      { personId: 'L1', rule: 'booking', note: 'not_service_day' },
    ]));
    // The booking rule never reaches createFines; the fee rule (unpaid, default facts) still can.
    expect(d.createFines).toHaveBeenCalledTimes(1);
    expect(d.createFines).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'maintenance_unpaid' }));
  });

  it('skips both rules with no_current_year and never calls createFines when there is no current transport year', async () => {
    const d = deps({ loadLearnerFeeFacts: vi.fn(async () => ({ yearId: null, facts: new Map() })) });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(d.createFines).not.toHaveBeenCalled();
    expect(out.skipped).toEqual(expect.arrayContaining([
      { personId: 'L1', rule: 'fee', note: 'no_current_year' },
      { personId: 'L1', rule: 'booking', note: 'no_current_year' },
    ]));
  });

  // I1: the money-safety fix — a learner already fined for this key must be
  // found by the bulk pre-check and must NEVER reach createFines (no insert-
  // then-compensating-delete of a real billing_student_bills row every re-check).
  it('never calls createFines for a learner who already has a fine for this key (I1 pre-check)', async () => {
    const d = deps({ seedExistingKeys: ['maintenance-unpaid:Y:L1', 'no-booking:2026-09-23:L1'] });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(d.createFines).not.toHaveBeenCalled();
    expect(out.alreadyFined).toBe(2);
    expect(out.raised).toBe(0);
  });

  it('counts errors and keeps going when createFines throws for one rule', async () => {
    const created = new Set<string>();
    const d = deps({
      createFines: vi.fn(async (_svc, input) => {
        if (input.kind === 'no_booking') throw new Error('db unavailable');
        for (const pid of input.personIds) created.add(`${input.idempotencyKey}:${pid}`);
        return { created: 1, totalAmount: input.fixedAmount, skipped: [], duplicates: 0, errors: 0 };
      }),
      readFineIdsByKeys: vi.fn(async (_svc, keys) => {
        const map = new Map<string, string>();
        for (const k of keys) if (created.has(k)) map.set(k, 'fine-fee-1');
        return map;
      }),
    });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(out.raised).toBe(1);
    expect(out.errors).toBe(1);
  });

  it('counts an error when a learner is still absent from tms_fee_fine after the createFines batch', async () => {
    const d = deps({
      // createFines "succeeds" but never actually writes the row (simulates the
      // rare mismatch the read-back exists to catch).
      createFines: vi.fn(async (_svc, input) => ({ created: input.personIds.length, totalAmount: 0, skipped: [], duplicates: 0, errors: 0 })),
    });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(out.raised).toBe(0);
    expect(out.errors).toBe(2);
  });

  it('never fines the staff row on the check (R1)', async () => {
    const d = deps();
    await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    for (const call of (d.createFines as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1].personIds).not.toContain('S1');
    }
  });
});
