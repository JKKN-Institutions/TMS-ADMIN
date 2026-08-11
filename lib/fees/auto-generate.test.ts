import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateBills = vi.fn();
vi.mock('./generate', () => ({ generateBills: (...a: unknown[]) => generateBills(...a) }));

const loadSchedulingConfig = vi.fn();
vi.mock('@/lib/settings/scheduling', () => ({
  loadSchedulingConfig: (...a: unknown[]) => loadSchedulingConfig(...a),
}));

const logSystemActivity = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/activity/log', () => ({
  logSystemActivity: (...a: unknown[]) => logSystemActivity(...a),
}));

import { makeFakeSupabase } from './__testing__/fake-supabase';
import { autoGenerateBills } from './auto-generate';

function outcome(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      mode: 'generate', runId: 'run1', applicable: 5, learnerBilled: 2, staffDeferred: 0,
      skipped: 8, unresolved: 0, overridden: 0, errors: 0, notified: 0,
      bornOverdue: 1, conflictsSkipped: 0, feeMode: 'flat', structureName: 'S',
      ...over,
    },
  };
}

const STRUCTURES = [
  { id: 'fs1', name: 'Transport Fees 2026-2027' },
  { id: 'fs2', name: 'Transport Fees 2026-2027(Arts Self)' },
];

function fixture(structures = STRUCTURES) {
  return makeFakeSupabase({
    tms_transport_year: [{ id: 'ty1' }],
    tms_fee_structure: structures,
  });
}

beforeEach(() => {
  generateBills.mockReset().mockResolvedValue(outcome());
  loadSchedulingConfig.mockReset().mockResolvedValue({ autoGenerateBills: true });
  logSystemActivity.mockClear();
});

describe('autoGenerateBills', () => {
  it('does nothing when the master switch is off', async () => {
    loadSchedulingConfig.mockResolvedValue({ autoGenerateBills: false });
    const res = await autoGenerateBills(fixture() as never);
    expect(res.skipped).toBe('disabled');
    expect(generateBills).not.toHaveBeenCalled();
    expect(logSystemActivity).not.toHaveBeenCalled();
  });

  it('does nothing when no transport year is current', async () => {
    const svc = makeFakeSupabase({ tms_transport_year: [], tms_fee_structure: STRUCTURES });
    const res = await autoGenerateBills(svc as never);
    expect(res.skipped).toBe('no_current_transport_year');
    expect(generateBills).not.toHaveBeenCalled();
  });

  it('filters to active + auto_generate + the current year', async () => {
    const svc = fixture();
    await autoGenerateBills(svc as never);
    const q = svc.calls.find((c) => c.table === 'tms_fee_structure');
    const eqs = q!.ops.filter(([op]) => op === 'eq').map(([, args]) => args);
    expect(eqs).toContainEqual(['status', 'active']);
    expect(eqs).toContainEqual(['auto_generate', true]);
    expect(eqs).toContainEqual(['transport_year_id', 'ty1']);
  });

  it('runs every qualifying structure with the auto-only policies', async () => {
    await autoGenerateBills(fixture() as never);
    expect(generateBills).toHaveBeenCalledTimes(2);
    const opts = generateBills.mock.calls[0][1];
    expect(opts).toMatchObject({
      feeStructureId: 'fs1',
      mode: 'generate',
      actorId: null,
      skipConflicts: true,
      skipEmptyRun: true,
    });
  });

  it('aggregates billed and born-overdue totals across structures', async () => {
    generateBills
      .mockResolvedValueOnce(outcome({ learnerBilled: 2, bornOverdue: 1 }))
      .mockResolvedValueOnce(outcome({ learnerBilled: 3, bornOverdue: 3 }));
    const res = await autoGenerateBills(fixture() as never);
    expect(res.totalBilled).toBe(5);
    expect(res.totalBornOverdue).toBe(4);
    expect(res.structures).toHaveLength(2);
  });

  it('keeps going when one structure fails, and records its error', async () => {
    generateBills
      .mockResolvedValueOnce({ ok: false, status: 500, error: 'stop rates missing' })
      .mockResolvedValueOnce(outcome({ learnerBilled: 3 }));
    const res = await autoGenerateBills(fixture() as never);
    expect(res.structures[0].error).toBe('stop rates missing');
    expect(res.structures[0].billed).toBe(0);
    expect(res.totalBilled).toBe(3);
  });

  it('survives a thrown error from one structure', async () => {
    generateBills
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(outcome({ learnerBilled: 1 }));
    const res = await autoGenerateBills(fixture() as never);
    expect(res.structures[0].error).toContain('boom');
    expect(res.totalBilled).toBe(1);
  });

  it('logs activity only when something was actually billed', async () => {
    generateBills.mockResolvedValue(outcome({ learnerBilled: 0, runId: null }));
    await autoGenerateBills(fixture() as never);
    expect(logSystemActivity).not.toHaveBeenCalled();
  });

  it('logs one activity entry per structure that billed', async () => {
    generateBills
      .mockResolvedValueOnce(outcome({ learnerBilled: 2 }))
      .mockResolvedValueOnce(outcome({ learnerBilled: 0, runId: null }));
    await autoGenerateBills(fixture() as never);
    expect(logSystemActivity).toHaveBeenCalledTimes(1);
    expect(logSystemActivity.mock.calls[0][0]).toMatchObject({
      module: 'fees',
      action: 'generate',
      entityId: 'fs1',
    });
  });

  it('writes nothing in dryRun mode', async () => {
    await autoGenerateBills(fixture() as never, { dryRun: true });
    expect(generateBills.mock.calls[0][1].mode).toBe('dry_run');
    expect(logSystemActivity).not.toHaveBeenCalled();
  });
});
