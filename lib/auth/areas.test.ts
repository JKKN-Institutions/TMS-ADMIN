import { describe, it, expect } from 'vitest';
import { resolveArea } from './areas';

describe('resolveArea', () => {
  it('routes printed bus sticker links to the boarding area', () => {
    expect(resolveArea('/i/TN28AB1234')).toBe('boarding');
  });
});
