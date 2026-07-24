import { describe, it, expect } from 'vitest';
import { buildFeeStructurePayload, EDITABLE } from './fields';

describe('buildFeeStructurePayload — auto_generate (nightly auto-bill opt-in)', () => {
  it('coerces to a real boolean', () => {
    expect(buildFeeStructurePayload({ auto_generate: true }).auto_generate).toBe(true);
    expect(buildFeeStructurePayload({ auto_generate: false }).auto_generate).toBe(false);
    expect(buildFeeStructurePayload({ auto_generate: 'true' }).auto_generate).toBe(true);
    expect(buildFeeStructurePayload({ auto_generate: 'anything-else' }).auto_generate).toBe(false);
  });

  it('is omitted when the key is absent, so a partial PUT never flips it', () => {
    expect('auto_generate' in buildFeeStructurePayload({ name: 'x' })).toBe(false);
  });

  it('is on the write whitelist', () => {
    expect(EDITABLE).toContain('auto_generate');
  });

  it('still drops unknown keys (whitelist intact)', () => {
    expect('id' in buildFeeStructurePayload({ id: 'should-not-write', auto_generate: true })).toBe(false);
  });
});
