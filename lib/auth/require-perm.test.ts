import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const rpc = vi.fn();
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ rpc }) }));

import { denyUnlessPerm } from './require-perm';

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://127.0.0.1/api/admin/x', { method: 'POST', headers });
}

describe('denyUnlessPerm', () => {
  beforeEach(() => rpc.mockReset());

  it('401 when the proxy stamped no identity', async () => {
    const res = await denyUnlessPerm(req(), 'tms.routes.edit');
    expect(res?.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows super admins without asking the database', async () => {
    const res = await denyUnlessPerm(req({ 'x-user-id': 'u1', 'x-user-super': '1' }), 'tms.routes.edit');
    expect(res).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('403 when the user lacks every listed permission', async () => {
    rpc.mockResolvedValue({ data: false });
    const res = await denyUnlessPerm(req({ 'x-user-id': 'u1' }), 'tms.routes.edit', 'tms.routes.create');
    expect(res?.status).toBe(403);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('allows a user holding any one of the permissions', async () => {
    rpc.mockResolvedValueOnce({ data: false }).mockResolvedValueOnce({ data: true });
    const res = await denyUnlessPerm(req({ 'x-user-id': 'u1' }), 'tms.routes.edit', 'tms.routes.create');
    expect(res).toBeNull();
  });
});
