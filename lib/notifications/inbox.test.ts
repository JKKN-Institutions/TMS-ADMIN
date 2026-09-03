import { describe, it, expect } from 'vitest';
import { getInboxItem, toInboxItem } from './inbox';

const notif = {
  id: 'n1',
  title: 'Bus delayed',
  body: 'Route 5 is running late',
  url: '/student/routes',
  icon: null,
  category: 'transport',
  priority: 'high',
  expires_at: null as string | null,
};

/**
 * Minimal stand-in for the PostgREST builder. Records every .eq() so the tests can
 * assert the own-row security guard is actually applied, not just assumed.
 */
function fakeSvc(row: unknown, error?: { code?: string; message?: string }) {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    },
    maybeSingle: async () => ({ data: row, error: error ?? null }),
  };
  return { svc: { from: () => builder } as never, filters };
}

describe('toInboxItem', () => {
  it('flattens the joined row and keeps the recipient-row id as the handle', () => {
    const item = toInboxItem({
      id: 'r1',
      read_at: null,
      created_at: '2026-09-01T10:00:00Z',
      tms_notification: notif,
    });
    expect(item).toMatchObject({
      id: 'r1',
      notificationId: 'n1',
      title: 'Bus delayed',
      url: '/student/routes',
      readAt: null,
      expired: false,
    });
  });

  it('unwraps the join when PostgREST returns it as an array', () => {
    const item = toInboxItem({
      id: 'r1',
      read_at: '2026-09-02T10:00:00Z',
      created_at: '2026-09-01T10:00:00Z',
      tms_notification: [notif],
    });
    expect(item?.notificationId).toBe('n1');
    expect(item?.readAt).toBe('2026-09-02T10:00:00Z');
  });

  it('marks a past expires_at as expired instead of dropping the item', () => {
    const item = toInboxItem({
      id: 'r1',
      read_at: null,
      created_at: '2026-09-01T10:00:00Z',
      tms_notification: { ...notif, expires_at: '2000-01-01T00:00:00Z' },
    });
    expect(item?.expired).toBe(true);
  });

  it('returns null when the joined message is missing', () => {
    expect(
      toInboxItem({ id: 'r1', read_at: null, created_at: '2026-09-01T10:00:00Z', tms_notification: null }),
    ).toBeNull();
  });
});

describe('getInboxItem', () => {
  it('scopes the lookup to BOTH the recipient row id and the signed-in user', async () => {
    const { svc, filters } = fakeSvc({
      id: 'r1',
      read_at: null,
      created_at: '2026-09-01T10:00:00Z',
      tms_notification: notif,
    });
    const item = await getInboxItem(svc, 'user-1', 'r1');
    expect(item?.id).toBe('r1');
    expect(filters).toEqual({ id: 'r1', user_id: 'user-1' });
  });

  it('returns null for another user\u2019s row (no match)', async () => {
    const { svc } = fakeSvc(null);
    expect(await getInboxItem(svc, 'user-1', 'r1')).toBeNull();
  });

  it('returns null when the table is missing (42P01) rather than throwing', async () => {
    const { svc } = fakeSvc(null, { code: '42P01', message: 'relation does not exist' });
    expect(await getInboxItem(svc, 'user-1', 'r1')).toBeNull();
  });

  it('throws on a real query error', async () => {
    const { svc } = fakeSvc(null, { code: '42501', message: 'permission denied' });
    await expect(getInboxItem(svc, 'user-1', 'r1')).rejects.toThrow(/permission denied/);
  });
});
