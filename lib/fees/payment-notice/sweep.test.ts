// lib/fees/payment-notice/sweep.test.ts
import { describe, it, expect, vi } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import { runPaymentNoticeSweep } from './sweep';

const NOW = new Date('2026-09-23T06:00:00.000Z');
const SETTINGS = [{
  settings_data: { enabled: true, window_hours: 48, reminder_hours_before: 6, fine_due_days: 7, enabled_at: '2026-09-22T04:30:00.000Z' },
}];

function deps(over: Record<string, unknown> = {}) {
  return {
    term1PaidLearnerIds: vi.fn(async () => new Set<string>()),
    createFines: vi.fn(async () => ({ created: 1, totalAmount: 1200, skipped: [], duplicates: 0, errors: 0 })),
    notify: vi.fn(async () => {}),
    logSystemActivity: vi.fn(async () => {}),
    ...over,
  };
}

function base(extra: Record<string, unknown[]> = {}) {
  return makeFakeSupabase({
    admin_settings: SETTINGS,
    tms_transport_year: [{ id: 'Y' }],
    tms_fee_bill: [],
    tms_fee_override: [],
    tms_fee_payment_notice: [],
    learners_profiles: [{ id: 'A', transport_stop_id: 'S1' }],
    tms_fine_stop_rate: [{ stop_id: 'S1', fine_amount: 1200 }],
    tms_fee_fine: [{ id: 'F1' }],
    ...extra,
  });
}

describe('runPaymentNoticeSweep', () => {
  it('does nothing when the switch is off', async () => {
    const svc = makeFakeSupabase({ admin_settings: [] });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.skipped).toBe('disabled');
    expect(d.createFines).not.toHaveBeenCalled();
  });

  it('opens a notice and notifies the learner', async () => {
    const svc = base({ tms_fee_bill: [{ id: 'BILL', person_id: 'A', term_no: 1, created_at: '2026-07-01T00:00:00.000Z', status: 'generated' }] });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.opened).toBe(1);
    const up = svc.calls.find((c) => c.table === 'tms_fee_payment_notice' && c.ops.some(([op]) => op === 'upsert'));
    expect(up).toBeTruthy();
    expect(d.notify).toHaveBeenCalledTimes(1);
  });

  it('fines an expired notice through createFines with the notice idempotency key', async () => {
    const svc = base({
      tms_fee_payment_notice: [{
        id: 'N', person_id: 'A', status: 'running', started_at: '2026-09-21T06:00:00.000Z',
        expires_at: '2026-09-23T05:00:00.000Z', reminder_sent_at: '2026-09-23T00:00:00.000Z', source_bill_id: 'BILL',
      }],
    });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.fined).toBe(1);
    expect(d.createFines).toHaveBeenCalledWith(svc, expect.objectContaining({
      transportYearId: 'Y', personIds: ['A'], idempotencyKey: 'maintenance-unpaid:Y', actorId: null, notify: true,
      reason: 'Transport Maintenance Fee unpaid 48 hours after notice', dueDate: '2026-09-30',
      sourceBillByPerson: { A: 'BILL' },
    }));
    expect(d.logSystemActivity).toHaveBeenCalledWith(expect.objectContaining({ module: 'fees', action: 'generate' }));
  });

  it('closes the notice against an existing inspection fine (duplicate key)', async () => {
    const svc = base({
      tms_fee_payment_notice: [{
        id: 'N', person_id: 'A', status: 'running', started_at: '2026-09-21T06:00:00.000Z',
        expires_at: '2026-09-23T05:00:00.000Z', reminder_sent_at: '2026-09-23T00:00:00.000Z', source_bill_id: 'BILL',
      }],
      tms_fee_fine: [{ id: 'F-INSPECTION', idempotency_key: 'maintenance-unpaid:Y:A' }],
    });
    const d = deps({ createFines: vi.fn(async () => ({ created: 0, totalAmount: 0, skipped: [], duplicates: 1, errors: 0 })) });
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.fined).toBe(1);
    const upd = svc.calls.find((c) => c.table === 'tms_fee_payment_notice' && c.ops.some(([op, v]) => op === 'update' && (v[0] as { fine_id?: string }).fine_id === 'F-INSPECTION'));
    expect(upd).toBeTruthy();
  });

  it('keeps the notice running when createFines skips the learner', async () => {
    const svc = base({
      tms_fee_payment_notice: [{
        id: 'N', person_id: 'A', status: 'running', started_at: '2026-09-21T06:00:00.000Z',
        expires_at: '2026-09-23T05:00:00.000Z', reminder_sent_at: null, source_bill_id: 'BILL',
      }],
    });
    const d = deps({
      createFines: vi.fn(async () => ({ created: 0, totalAmount: 0, skipped: [{ person_id: 'A', person_name: 'x', reason: 'no_rate' }], duplicates: 0, errors: 0 })),
    });
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.fined).toBe(0);
    expect(out.fineSkipped).toBe(1);
    const fineUpdate = svc.calls.find((c) =>
      c.table === 'tms_fee_payment_notice' &&
      c.ops.some(([op, args]) => op === 'update' && (args[0] as { status?: string }).status === 'fined'));
    expect(fineUpdate).toBeUndefined();
  });

  it('dry run writes nothing and calls nothing', async () => {
    const svc = base({ tms_fee_bill: [{ id: 'BILL', person_id: 'A', term_no: 1, created_at: '2026-07-01T00:00:00.000Z', status: 'generated' }] });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d, dryRun: true });
    expect(out.opened).toBe(1);
    expect(d.notify).not.toHaveBeenCalled();
    expect(svc.calls.some((c) => c.ops.some(([op]) => op === 'upsert' || op === 'update' || op === 'insert'))).toBe(false);
  });

  it('reads existing maintenance-unpaid fines for the year with a key prefix filter', async () => {
    const svc = base();
    await runPaymentNoticeSweep(svc as never, { now: NOW, deps: deps() });
    const read = svc.calls.find((c) => c.table === 'tms_fee_fine' && c.ops.some(([op]) => op === 'like'));
    expect(read).toBeTruthy();
    expect(read!.ops).toContainEqual(['eq', ['transport_year_id', 'Y']]);
    expect(read!.ops).toContainEqual(['like', ['idempotency_key', 'maintenance-unpaid:Y:%']]);
  });

  it('does not open a notice for a learner already fined by an inspection', async () => {
    const svc = base({
      tms_fee_bill: [{ id: 'BILL', person_id: 'A', term_no: 1, created_at: '2026-07-01T00:00:00.000Z', status: 'generated' }],
      tms_fee_fine: [{ id: 'F-INSPECTION', person_id: 'A', idempotency_key: 'maintenance-unpaid:Y:A' }],
    });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(out.opened).toBe(0);
    expect(svc.calls.some((c) => c.table === 'tms_fee_payment_notice' && c.ops.some(([op]) => op === 'upsert'))).toBe(false);
    expect(d.notify).not.toHaveBeenCalled();
  });

  it('closes a running notice against an existing inspection fine WITHOUT calling createFines or notifying', async () => {
    const svc = base({
      tms_fee_payment_notice: [{
        id: 'N', person_id: 'A', status: 'running', started_at: '2026-09-21T06:00:00.000Z',
        expires_at: '2026-09-23T05:00:00.000Z', reminder_sent_at: '2026-09-23T00:00:00.000Z', source_bill_id: 'BILL',
      }],
      tms_fee_fine: [{ id: 'F-INSPECTION', person_id: 'A', idempotency_key: 'maintenance-unpaid:Y:A' }],
    });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d });
    expect(d.createFines).not.toHaveBeenCalled();
    expect(d.notify).not.toHaveBeenCalled();
    expect(out.closedAlreadyFined).toBe(1);
    expect(out.fined).toBe(0);
    const upd = svc.calls.find((c) => c.table === 'tms_fee_payment_notice' && c.ops.some(([op, v]) =>
      op === 'update' && (v[0] as { status?: string; fine_id?: string }).status === 'fined'
      && (v[0] as { fine_id?: string }).fine_id === 'F-INSPECTION'));
    expect(upd).toBeTruthy();
    expect(upd!.ops).toContainEqual(['eq', ['id', 'N']]);
    expect(upd!.ops).toContainEqual(['eq', ['status', 'running']]);
  });

  it('dry run counts already-fined closures but writes nothing', async () => {
    const svc = base({
      tms_fee_payment_notice: [{
        id: 'N', person_id: 'A', status: 'running', started_at: '2026-09-21T06:00:00.000Z',
        expires_at: '2026-09-23T05:00:00.000Z', reminder_sent_at: null, source_bill_id: 'BILL',
      }],
      tms_fee_fine: [{ id: 'F-INSPECTION', person_id: 'A', idempotency_key: 'maintenance-unpaid:Y:A' }],
    });
    const d = deps();
    const out = await runPaymentNoticeSweep(svc as never, { now: NOW, deps: d, dryRun: true });
    expect(out.closedAlreadyFined).toBe(1);
    expect(svc.calls.some((c) => c.ops.some(([op]) => op === 'upsert' || op === 'update' || op === 'insert'))).toBe(false);
  });

  it('fails loudly when the existing-fine read errors', async () => {
    const svc = makeFakeSupabase({
      admin_settings: SETTINGS, tms_transport_year: [{ id: 'Y' }], tms_fee_bill: [], tms_fee_override: [],
      tms_fee_payment_notice: [], learners_profiles: [], tms_fine_stop_rate: [], tms_fee_fine: [],
    }, { errors: { tms_fee_fine: { message: 'boom' } } });
    await expect(runPaymentNoticeSweep(svc as never, { now: NOW, deps: deps() })).rejects.toThrow(/boom/);
  });
});
