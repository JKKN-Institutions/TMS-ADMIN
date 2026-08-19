import { describe, it, expect } from 'vitest';
import { cancelStaffBills, makeStaffBillsPayable } from './cancel-staff-bill';

/** Minimal stand-in for the supabase query builder chain these functions use. */
function fakeSvc(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<Record<string, unknown>> = [];
  const builder: Record<string, unknown> = {
    update(payload: unknown) { calls.push({ op: 'update', payload }); return builder; },
    eq(col: string, val: unknown) { calls.push({ op: 'eq', col, val }); return builder; },
    in(col: string, val: unknown) { calls.push({ op: 'in', col, val }); return builder; },
    is(col: string, val: unknown) { calls.push({ op: 'is', col, val }); return builder; },
    neq(col: string, val: unknown) { calls.push({ op: 'neq', col, val }); return builder; },
    gte(col: string, val: unknown) { calls.push({ op: 'gte', col, val }); return builder; },
    lte(col: string, val: unknown) { calls.push({ op: 'lte', col, val }); return builder; },
    select() { return Promise.resolve(result); },
  };
  return {
    calls,
    svc: { from(table: string) { calls.push({ op: 'from', table }); return builder; } },
  };
}

describe('cancelStaffBills', () => {
  it('cancels the uncancelled, unpaid current-year staff bills', async () => {
    const { svc, calls } = fakeSvc({ data: [{ id: 'a' }, { id: 'b' }], error: null });
    const res = await cancelStaffBills(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    });
    expect(res).toEqual({ cancelled: 2 });
    expect(calls).toContainEqual({ op: 'from', table: 'tms_fee_bill' });
    expect(calls.some((c) => c.op === 'update'
      && (c.payload as { status: string }).status === 'cancelled')).toBe(true);
    // A paid bill must never be cancelled -- that would erase a payment.
    expect(calls).toContainEqual({ op: 'is', col: 'paid_at', val: null });
    // Already-cancelled bills must be excluded, or a re-run recounts them and
    // inflates the "bills cancelled this run" total the verdict records.
    expect(calls).toContainEqual({ op: 'neq', col: 'status', val: 'cancelled' });
  });

  it('throws when the update fails rather than reporting success', async () => {
    // A silently failed cancellation leaves a staffer billed for a month they
    // passed, and the verdict row would claim otherwise.
    const { svc } = fakeSvc({ data: null, error: { message: 'boom' } });
    await expect(cancelStaffBills(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    })).rejects.toThrow(/boom/);
  });

  it('reports zero when there was nothing to cancel', async () => {
    const { svc } = fakeSvc({ data: [], error: null });
    expect(await cancelStaffBills(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    })).toEqual({ cancelled: 0 });
  });

  it('scopes to the due_date window when one is supplied', async () => {
    const { svc, calls } = fakeSvc({ data: [{ id: 'a' }], error: null });
    const res = await cancelStaffBills(svc as never, {
      personId: 'p1', transportYearId: 'y1', dueFrom: '2026-08-01', dueTo: '2026-08-31',
    });
    expect(res).toEqual({ cancelled: 1 });
    expect(calls).toContainEqual({ op: 'gte', col: 'due_date', val: '2026-08-01' });
    expect(calls).toContainEqual({ op: 'lte', col: 'due_date', val: '2026-08-31' });
  });

  it('omitting the window leaves the previous whole-year behaviour unchanged', async () => {
    const { svc, calls } = fakeSvc({ data: [{ id: 'a' }, { id: 'b' }], error: null });
    const res = await cancelStaffBills(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    });
    expect(res).toEqual({ cancelled: 2 });
    expect(calls.some((c) => c.op === 'gte')).toBe(false);
    expect(calls.some((c) => c.op === 'lte')).toBe(false);
  });

  it('leaves a bill outside the window alone', async () => {
    // The fake builder can't filter by due_date itself, so this documents the
    // contract at the call boundary: a window narrows the update via gte/lte
    // on due_date, and a bill whose due_date falls outside it is excluded by
    // that filter before Postgres ever executes the update.
    const { svc, calls } = fakeSvc({ data: [], error: null });
    await cancelStaffBills(svc as never, {
      personId: 'p1', transportYearId: 'y1', dueFrom: '2026-09-01', dueTo: '2026-09-30',
    });
    expect(calls).toContainEqual({ op: 'gte', col: 'due_date', val: '2026-09-01' });
    expect(calls).toContainEqual({ op: 'lte', col: 'due_date', val: '2026-09-30' });
  });
});

describe('makeStaffBillsPayable', () => {
  it('promotes staff_deferred bills to generated', async () => {
    const { svc, calls } = fakeSvc({ data: [{ id: 'a' }], error: null });
    const res = await makeStaffBillsPayable(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    });
    expect(res).toEqual({ generated: 1 });
    expect(calls.some((c) => c.op === 'update'
      && (c.payload as { status: string }).status === 'generated')).toBe(true);
    expect(calls).toContainEqual({ op: 'eq', col: 'status', val: 'staff_deferred' });
  });

  it('throws when the update fails', async () => {
    const { svc } = fakeSvc({ data: null, error: { message: 'nope' } });
    await expect(makeStaffBillsPayable(svc as never, {
      personId: 'p1', transportYearId: 'y1',
    })).rejects.toThrow(/nope/);
  });
});
