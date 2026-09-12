import { describe, it, expect } from 'vitest';
import { classifyScan } from './scan-resolve';

// The retired boarding pass: a learner id and a signature. Kept here as a
// REFUSAL case — the scanner must not accept it any more.
const RETIRED_PASS = '11111111-2222-3333-4444-555555555555.abcdef0123456789abcdef0123456789';

describe('classifyScan', () => {
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
    expect(classifyScan('3482957', 'camera')).toEqual({
      shape: 'jkkn_id', code: '348295-7', refusal: null,
    });
  });

  it('refuses a retired boarding pass', () => {
    expect(classifyScan(RETIRED_PASS, 'camera')).toEqual({
      shape: 'unknown', code: RETIRED_PASS, refusal: 'unrecognised',
    });
  });

  it('refuses a retired six-digit pass code', () => {
    expect(classifyScan('429173', 'typed')).toEqual({
      shape: 'unknown', code: '429173', refusal: 'unrecognised',
    });
    expect(classifyScan('429173', 'camera').refusal).toBe('unrecognised');
  });

  it('refuses anything else', () => {
    expect(classifyScan('hello', 'camera')).toEqual({
      shape: 'unknown', code: 'hello', refusal: 'unrecognised',
    });
    expect(classifyScan('', 'camera').refusal).toBe('unrecognised');
  });
});
