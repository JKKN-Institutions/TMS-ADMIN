import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: () => ({ insert }) }),
}));

import { logSystemActivity } from './log';

describe('logSystemActivity', () => {
  beforeEach(() => insert.mockClear());

  it('writes a null actor with a system role and no client info', async () => {
    await logSystemActivity({
      module: 'fees',
      action: 'generate',
      entityType: 'tms_fee_structure',
      entityId: 'fs1',
      entityLabel: 'Transport Fees 2026-2027',
      description: 'Automatic run billed 3 learner(s)',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.actor_id).toBeNull();
    expect(row.actor_role).toBe('system');
    expect(row.ip_address).toBeNull();
    expect(row.user_agent).toBeNull();
    expect(row.module).toBe('fees');
    expect(row.action).toBe('generate');
  });
});
