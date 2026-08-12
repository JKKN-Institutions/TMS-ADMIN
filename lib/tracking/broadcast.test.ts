import { describe, it, expect, vi, afterEach } from 'vitest';
import { busTopic, FLEET_TOPIC, buildFixMessages, publishFix, type LiveFix } from './broadcast';

const fix: LiveFix = {
  tripId: 't1',
  routeId: 'r1',
  vehicleId: 'v1',
  latitude: 11.44,
  longitude: 77.73,
  speed: 8,
  heading: 90,
  accuracyM: 12,
  at: '2026-08-11T10:00:00.000Z',
};

describe('topics', () => {
  it('namespaces the per-route topic', () => {
    expect(busTopic('abc')).toBe('tms_bus:abc');
  });

  it('uses a distinct fleet topic', () => {
    expect(FLEET_TOPIC).toBe('tms_fleet');
  });
});

describe('buildFixMessages', () => {
  it('emits exactly one message per topic, both private', () => {
    const msgs = buildFixMessages('r1', fix);
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => m.topic)).toEqual(['tms_bus:r1', 'tms_fleet']);
    expect(msgs.every((m) => m.private)).toBe(true);
    expect(msgs.every((m) => m.event === 'fix')).toBe(true);
  });

  it('carries the routeId in the payload so fleet subscribers can route it', () => {
    const [, fleet] = buildFixMessages('r1', fix);
    expect((fleet.payload as LiveFix).routeId).toBe('r1');
  });
});

describe('publishFix', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns false and does not throw when the environment is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    await expect(publishFix('r1', fix)).resolves.toBe(false);
  });

  it('returns false when the transport throws — never rejects', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(publishFix('r1', fix)).resolves.toBe(false);
  });

  it('returns false on a non-ok response', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(publishFix('r1', fix)).resolves.toBe(false);
  });

  it('posts both messages in a single request', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    const f = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', f);

    await expect(publishFix('r1', fix)).resolves.toBe(true);
    expect(f).toHaveBeenCalledTimes(1);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/realtime/v1/api/broadcast');
    const body = JSON.parse(init.body as string) as { messages: unknown[] };
    expect(body.messages).toHaveLength(2);
  });
});
