import { describe, it, expect, vi } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import { raiseCheckFines } from './fines';

const CHECK = { id: 'C', route_id: 'R1', check_date: '2026-09-23' };
const ON = [{ settings_data: { enabled: true, enabled_at: '2026-09-22T00:00:00.000Z', unpaid_amount: 500, no_booking_amount: 200, fine_due_days: 7 } }];

function svcWith(settings: unknown[]) {
  return makeFakeSupabase({
    admin_settings: settings,
    tms_route_check_person: [
      { id: 'P1', check_id: 'C', person_kind: 'learner', learner_id: 'L1' },
      { id: 'P2', check_id: 'C', person_kind: 'staff', staff_id: 'S1' },
    ],
    tms_fee_fine: [{ id: 'F1', idempotency_key: 'maintenance-unpaid:Y:L1' }, { id: 'F2', idempotency_key: 'no-booking:2026-09-23:L1' }],
  });
}

function deps(over: Record<string, unknown> = {}) {
  return {
    now: () => new Date('2026-09-23T04:00:00.000Z'),
    loadLearnerFeeFacts: vi.fn(async () => ({
      yearId: 'Y',
      facts: new Map([['L1', { mark: 'unpaid', term1DueDate: '2026-07-31', runningNoticeExpiresAt: null, hasBill: true }]]),
    })),
    loadBookingRoutes: vi.fn(async () => new Map<string, string[]>()),
    loadExceptionDates: vi.fn(async () => new Set<string>()),
    createFines: vi.fn(async () => ({ created: 1, totalAmount: 500, skipped: [], duplicates: 0, errors: 0 })),
    logSystemActivity: vi.fn(async () => {}),
    ...over,
  };
}

describe('raiseCheckFines', () => {
  it('does nothing but stamp a note when fines are off', async () => {
    const d = deps();
    const out = await raiseCheckFines(svcWith([]) as never, CHECK, 'actor', d);
    expect(out).toMatchObject({ enabled: false, raised: 0 });
    expect(d.createFines).not.toHaveBeenCalled();
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

  it('counts a duplicate key as already fined', async () => {
    const d = deps({ createFines: vi.fn(async () => ({ created: 0, totalAmount: 0, skipped: [], duplicates: 1, errors: 0 })) });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(out.alreadyFined).toBe(2);
    expect(out.raised).toBe(0);
  });

  it('does not fine a booked-other-bus learner or on a holiday', async () => {
    const d = deps({
      loadBookingRoutes: vi.fn(async () => new Map([['L1', ['R9']]])),
      loadLearnerFeeFacts: vi.fn(async () => ({ yearId: 'Y', facts: new Map([['L1', { mark: 'paid', term1DueDate: null, runningNoticeExpiresAt: null, hasBill: true }]]) })),
    });
    const out = await raiseCheckFines(svcWith(ON) as never, CHECK, 'actor', d);
    expect(d.createFines).not.toHaveBeenCalled();
    expect(out.skipped).toEqual(expect.arrayContaining([
      { personId: 'L1', rule: 'booking', note: 'booked_other_bus' },
      { personId: 'L1', rule: 'fee', note: 'not_unpaid' },
    ]));
  });
});
