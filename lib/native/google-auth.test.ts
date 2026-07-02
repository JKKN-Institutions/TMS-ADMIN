import { describe, it, expect, vi, beforeEach } from 'vitest';

const login = vi.fn();
const initialize = vi.fn();
vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: {
    initialize: (...a: unknown[]) => initialize(...a),
    login: (...a: unknown[]) => login(...a),
    logout: vi.fn(),
  },
}));

import { nativeGoogleSignIn } from './google-auth';

describe('nativeGoogleSignIn', () => {
  beforeEach(() => {
    login.mockReset();
    initialize.mockReset();
    process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'test-web-client-id';
  });

  it('returns the idToken from the plugin result', async () => {
    login.mockResolvedValue({ provider: 'google', result: { idToken: 'abc123' } });
    const out = await nativeGoogleSignIn();
    expect(out).toEqual({ idToken: 'abc123' });
  });

  it('throws when no idToken is returned', async () => {
    login.mockResolvedValue({ provider: 'google', result: {} });
    await expect(nativeGoogleSignIn()).rejects.toThrow(/No Google ID token/);
  });
});
