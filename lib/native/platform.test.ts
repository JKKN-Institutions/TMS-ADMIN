import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => (globalThis as Record<string, unknown>).__native ?? false,
    getPlatform: () => (globalThis as Record<string, unknown>).__platform ?? 'web',
  },
}));

import { isNativeApp, getPlatform } from './platform';

describe('platform helpers', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__native = false;
    (globalThis as Record<string, unknown>).__platform = 'web';
  });

  it('reports web by default', () => {
    expect(isNativeApp()).toBe(false);
    expect(getPlatform()).toBe('web');
  });

  it('reports native android when Capacitor says so', () => {
    (globalThis as Record<string, unknown>).__native = true;
    (globalThis as Record<string, unknown>).__platform = 'android';
    expect(isNativeApp()).toBe(true);
    expect(getPlatform()).toBe('android');
  });
});
