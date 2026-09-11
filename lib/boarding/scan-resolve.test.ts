import { describe, it, expect } from 'vitest';
import { classifyScan } from './scan-resolve';

const PASS = '11111111-2222-3333-4444-555555555555.abcdef0123456789abcdef0123456789';

describe('classifyScan', () => {
  it('recognises a signed boarding pass from either source', () => {
    expect(classifyScan(PASS, 'camera')).toEqual({ shape: 'pass', code: PASS, refusal: null });
    expect(classifyScan(PASS, 'typed')).toEqual({ shape: 'pass', code: PASS, refusal: null });
  });

  it('accepts a JKKN ID from the camera', () => {
    expect(classifyScan('348295-7', 'camera')).toEqual({
      shape: 'jkkn_id', code: '348295-7', refusal: null,
    });
  });

  it('refuses a JKKN ID that was typed, and says why', () => {
    expect(classifyScan('348295-7', 'typed')).toEqual({
      shape: 'jkkn_id', code: '348295-7', refusal: 'typed_jkkn_id',
    });
  });

  it('strips the newline a barcode wedge appends', () => {
    expect(classifyScan('348295-7\r\n', 'camera').code).toBe('348295-7');
  });

  it('inserts the missing dash so seven bare digits still classify', () => {
    // It is still refused for being typed, but it must be refused for the
    // RIGHT reason: "not recognised" would send staff hunting a bad card.
    expect(classifyScan('3482957', 'typed')).toEqual({
      shape: 'jkkn_id', code: '348295-7', refusal: 'typed_jkkn_id',
    });
  });

  it('recognises a six-digit pass code', () => {
    expect(classifyScan('429173', 'typed')).toEqual({
      shape: 'pass_code', code: '429173', refusal: null,
    });
  });

  it('tolerates a pass code typed with a space', () => {
    expect(classifyScan('429 173', 'typed').code).toBe('429173');
  });

  it('refuses anything else', () => {
    expect(classifyScan('hello', 'camera')).toEqual({
      shape: 'unknown', code: 'hello', refusal: 'unrecognised',
    });
    expect(classifyScan('', 'camera').refusal).toBe('unrecognised');
  });
});
