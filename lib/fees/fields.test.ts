import { describe, it, expect } from 'vitest';
import { buildFeeStructurePayload, EDITABLE } from './fields';

describe('buildFeeStructurePayload — auto_generate', () => {
  it('lists auto_generate as writable', () => {
    expect(EDITABLE).toContain('auto_generate');
  });

  it('passes a true through', () => {
    expect(buildFeeStructurePayload({ auto_generate: true }).auto_generate).toBe(true);
  });

  it('passes a false through rather than dropping it', () => {
    // Dropping false would make the toggle impossible to turn OFF.
    const out = buildFeeStructurePayload({ auto_generate: false });
    expect('auto_generate' in out).toBe(true);
    expect(out.auto_generate).toBe(false);
  });

  it('omits the key entirely when absent, so PUT stays partial', () => {
    expect('auto_generate' in buildFeeStructurePayload({ name: 'x' })).toBe(false);
  });

  it('coerces a non-boolean to false rather than writing garbage', () => {
    expect(buildFeeStructurePayload({ auto_generate: 'yes' }).auto_generate).toBe(false);
  });
});
