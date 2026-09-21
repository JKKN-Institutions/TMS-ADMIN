import { describe, it, expect, vi } from 'vitest';
import { resolveLearnerProfileIds } from './learner-recipients';

function svcWith(rpc: (...a: unknown[]) => Promise<{ data: unknown; error: unknown }>) {
  return { rpc: vi.fn(rpc) } as never;
}

describe('resolveLearnerProfileIds', () => {
  it('returns only reachable learners', async () => {
    const svc = svcWith(async () => ({
      data: [
        { learner_id: 'L1', profile_id: 'P1' },
        { learner_id: 'L2', profile_id: null },
      ],
      error: null,
    }));
    const map = await resolveLearnerProfileIds(svc, ['L1', 'L2']);
    expect([...map.entries()]).toEqual([['L1', 'P1']]);
  });

  it('chunks at 150 ids per call', async () => {
    const svc = svcWith(async () => ({ data: [], error: null }));
    const ids = Array.from({ length: 301 }, (_, i) => `L${i}`);
    await resolveLearnerProfileIds(svc, ids);
    const calls = (svc as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls;
    expect(calls.map((c) => (c[1] as { p_learner_ids: string[] }).p_learner_ids.length)).toEqual([150, 150, 1]);
  });

  it('throws on RPC error rather than returning an empty map', async () => {
    const svc = svcWith(async () => ({ data: null, error: { message: 'boom' } }));
    await expect(resolveLearnerProfileIds(svc, ['L1'])).rejects.toThrow(/boom/);
  });

  it('makes no call for an empty list', async () => {
    const svc = svcWith(async () => ({ data: [], error: null }));
    expect((await resolveLearnerProfileIds(svc, [])).size).toBe(0);
    expect((svc as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });
});
