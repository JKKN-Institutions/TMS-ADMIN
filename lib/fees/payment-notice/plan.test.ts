import { describe, it, expect } from 'vitest';
import { planSweep, type PlanInput, type NoticeRow } from './plan';

const NOW = new Date('2026-09-23T06:00:00.000Z');
const ENABLED = '2026-09-22T04:30:00.000Z';
const cfg = { enabled: true, windowHours: 48, reminderHoursBefore: 6, fineDueDays: 7, enabledAt: ENABLED };

function input(p: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW, cfg, paid: new Set(), overridden: new Set(), unpaidBills: [],
    fineAmount: new Map([['A', 1200], ['B', 900]]), notices: [], ...p,
  };
}
function notice(p: Partial<NoticeRow>): NoticeRow {
  return {
    id: 'N', person_id: 'A', status: 'running', started_at: ENABLED,
    expires_at: '2026-09-24T04:30:00.000Z', reminder_sent_at: null, source_bill_id: 'BILL', ...p,
  };
}

describe('planSweep — opening', () => {
  it('opens a notice for an unpaid learner, measured from go-live', () => {
    const plan = planSweep(input({ unpaidBills: [{ person_id: 'A', bill_id: 'BILL', created_at: '2026-07-01T00:00:00.000Z' }] }));
    expect(plan.open).toEqual([{
      person_id: 'A', source_bill_id: 'BILL', started_at: NOW.toISOString(),
      expires_at: '2026-09-24T04:30:00.000Z', amount: 1200,
    }]);
  });

  it('never opens for paid, overridden, unpriced, or already-noticed learners', () => {
    const bills = ['A', 'B', 'C', 'D'].map((p) => ({ person_id: p, bill_id: `b${p}`, created_at: ENABLED }));
    const plan = planSweep(input({
      unpaidBills: bills,
      paid: new Set(['A']),
      overridden: new Set(['B']),
      fineAmount: new Map([['A', 1], ['B', 1], ['D', 1]]), // C unpriced
      notices: [notice({ id: 'ND', person_id: 'D', status: 'fined' })],
    }));
    expect(plan.open).toEqual([]);
  });

  it('gives a fresh full window when the computed deadline is already past', () => {
    const plan = planSweep(input({
      cfg: { ...cfg, enabledAt: '2026-09-01T00:00:00.000Z' },
      unpaidBills: [{ person_id: 'A', bill_id: 'BILL', created_at: '2026-07-01T00:00:00.000Z' }],
    }));
    expect(plan.open[0].expires_at).toBe('2026-09-25T06:00:00.000Z');
  });
});

describe('planSweep — running notices', () => {
  it('marks paid BEFORE considering a fine, even when expired', () => {
    const plan = planSweep(input({
      paid: new Set(['A']),
      notices: [notice({ expires_at: '2026-09-23T05:59:00.000Z' })],
    }));
    expect(plan.markPaid).toEqual(['N']);
    expect(plan.fine).toEqual([]);
  });

  it('cancels a running notice whose learner got an override', () => {
    const plan = planSweep(input({ overridden: new Set(['A']), notices: [notice({})] }));
    expect(plan.cancel).toEqual(['N']);
    expect(plan.fine).toEqual([]);
  });

  it('fines an expired unpaid notice', () => {
    const plan = planSweep(input({ notices: [notice({ expires_at: '2026-09-23T06:00:00.000Z' })] }));
    expect(plan.fine).toEqual([{ notice_id: 'N', person_id: 'A', source_bill_id: 'BILL', expires_at: '2026-09-23T06:00:00.000Z' }]);
    expect(plan.remind).toEqual([]);
  });

  it('reminds once inside the reminder window', () => {
    const inside = notice({ expires_at: '2026-09-23T11:00:00.000Z' });
    expect(planSweep(input({ notices: [inside] })).remind).toEqual([
      { notice_id: 'N', person_id: 'A', expires_at: '2026-09-23T11:00:00.000Z', amount: 1200 },
    ]);
    const already = notice({ expires_at: '2026-09-23T11:00:00.000Z', reminder_sent_at: '2026-09-23T05:10:00.000Z' });
    expect(planSweep(input({ notices: [already] })).remind).toEqual([]);
    const early = notice({ expires_at: '2026-09-23T13:00:00.000Z' });
    expect(planSweep(input({ notices: [early] })).remind).toEqual([]);
  });

  it('ignores notices that are no longer running', () => {
    const plan = planSweep(input({
      notices: [notice({ status: 'paid' }), notice({ id: 'N2', status: 'fined', expires_at: '2026-09-01T00:00:00.000Z' })],
    }));
    expect(plan).toEqual({ markPaid: [], cancel: [], open: [], remind: [], fine: [] });
  });
});
