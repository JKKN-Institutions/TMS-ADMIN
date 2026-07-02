import { describe, it, expect } from 'vitest';
import { signPass, verifyPass, passCodeFor, matchPassCode } from './pass';

// Fixed learner ids + date — the tests assert structural/relational properties
// (6 digits, determinism, rotation, matching), never a specific code value, so
// they hold regardless of which signing secret is active in the environment.
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const DATE = '2026-06-30';

describe('passCodeFor', () => {
  it('returns a six-digit numeric string', () => {
    expect(passCodeFor(A, DATE)).toMatch(/^\d{6}$/);
  });

  it('is deterministic for the same learner and date', () => {
    expect(passCodeFor(A, DATE)).toBe(passCodeFor(A, DATE));
  });

  it('rotates across dates', () => {
    const dates = ['2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'];
    expect(new Set(dates.map((d) => passCodeFor(A, d))).size).toBeGreaterThan(1);
  });

  it('differs between learners on the same date', () => {
    expect(new Set([A, B, C].map((id) => passCodeFor(id, DATE))).size).toBeGreaterThan(1);
  });
});

describe('matchPassCode', () => {
  it('resolves the learner whose daily code matches', () => {
    expect(matchPassCode(passCodeFor(B, DATE), [A, B, C], DATE)).toEqual([B]);
  });

  it('accepts the code with formatting whitespace', () => {
    const code = passCodeFor(B, DATE);
    expect(matchPassCode(`${code.slice(0, 3)} ${code.slice(3)}`, [A, B, C], DATE)).toEqual([B]);
  });

  it('returns no match for a code none of the candidates own', () => {
    const known = new Set([A, B, C].map((id) => passCodeFor(id, DATE)));
    let miss = '000000';
    for (let n = 0; n < 1_000_000; n++) {
      const c = n.toString().padStart(6, '0');
      if (!known.has(c)) { miss = c; break; }
    }
    expect(matchPassCode(miss, [A, B, C], DATE)).toEqual([]);
  });

  it('rejects input that is not six digits', () => {
    expect(matchPassCode('123', [A, B, C], DATE)).toEqual([]);
    expect(matchPassCode('1234567', [A, B, C], DATE)).toEqual([]);
    expect(matchPassCode('', [A, B, C], DATE)).toEqual([]);
  });

  it('returns every colliding candidate so the caller can detect ambiguity', () => {
    // Two candidates sharing a code stand in for a real 6-digit collision.
    expect(matchPassCode(passCodeFor(A, DATE), [A, A], DATE)).toEqual([A, A]);
  });
});

describe('signPass / verifyPass (regression)', () => {
  it('round-trips a learner id through the long token', () => {
    expect(verifyPass(signPass(A))).toBe(A);
  });

  it('rejects a tampered token', () => {
    expect(verifyPass(signPass(A) + 'x')).toBeNull();
  });
});
