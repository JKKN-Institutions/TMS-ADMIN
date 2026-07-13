import { describe, it, expect, vi } from 'vitest';
import { reverseGeocode } from './geocode';

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

describe('reverseGeocode (nominatim default)', () => {
  it('summarises road + city + state from address parts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      display_name: 'NH-544, Komarapalayam, Namakkal, Tamil Nadu, India',
      address: { road: 'NH-544', city: 'Komarapalayam', state: 'Tamil Nadu' },
    }));
    const r = await reverseGeocode(11.44, 77.73, fetchImpl);
    expect(r).toBe('NH-544, Komarapalayam, Tamil Nadu');
  });

  it('falls back to display_name when no address parts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ display_name: 'Somewhere, India', address: {} }));
    expect(await reverseGeocode(0, 0, fetchImpl)).toBe('Somewhere, India');
  });

  it('sends a descriptive User-Agent (Nominatim policy)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ display_name: 'X', address: {} }));
    await reverseGeocode(11.44, 77.73, fetchImpl);
    const [, opts] = fetchImpl.mock.calls[0];
    expect((opts.headers as Record<string, string>)['User-Agent']).toMatch(/JKKN-TMS/);
  });

  it('returns null on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(await reverseGeocode(0, 0, fetchImpl)).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await reverseGeocode(0, 0, fetchImpl)).toBeNull();
  });
});
