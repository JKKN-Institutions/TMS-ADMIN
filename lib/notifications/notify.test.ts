import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above plain consts; vi.hoisted makes `dispatch` exist first.
const { dispatch } = vi.hoisted(() => ({
  dispatch: vi.fn(async (..._args: unknown[]) => ({ id: 'n1', recipientCount: 1 })),
}));
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: dispatch }));

import { notifyProfile, notifyLearner } from './notify';

beforeEach(() => dispatch.mockClear());

describe('notifyProfile', () => {
  it('sends a null creator for an empty actor id (created_by is a uuid column)', async () => {
    await notifyProfile({} as never, { profileId: 'P1', actorId: '', title: 't', body: 'b' });
    expect((dispatch.mock.calls[0] as unknown[])[1]).toMatchObject({ createdBy: null });
  });
});

describe('notifyLearner', () => {
  it('reaches a learner who has only an email match', async () => {
    const svc = {
      rpc: vi.fn(async () => ({ data: [{ learner_id: 'L1', profile_id: 'P-email' }], error: null })),
    };
    await notifyLearner(svc as never, { learnerId: 'L1', actorId: '', title: 't', body: 'b' });
    expect((dispatch.mock.calls[0] as unknown[])[1]).toMatchObject({
      targeting: { type: 'users', user_ids: ['P-email'] },
    });
  });

  it('is a silent no-op for an unreachable learner', async () => {
    const svc = { rpc: vi.fn(async () => ({ data: [{ learner_id: 'L1', profile_id: null }], error: null })) };
    await notifyLearner(svc as never, { learnerId: 'L1', actorId: '', title: 't', body: 'b' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
