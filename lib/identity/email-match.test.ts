import { describe, it, expect } from 'vitest';
import { emailIlikePattern } from './email-match';

describe('emailIlikePattern', () => {
  it('escapes the underscore, which ILIKE treats as a single-char wildcard', () => {
    // The bug this exists for: 'monisha_r@jkkn.ac.in' matched BOTH
    // monisha_r@jkkn.ac.in and monisha.r@jkkn.ac.in, because `_` is a wildcard.
    expect(emailIlikePattern('monisha_r@jkkn.ac.in')).toBe('monisha\\_r@jkkn.ac.in');
  });

  it('escapes the percent wildcard', () => {
    expect(emailIlikePattern('a%b@x.com')).toBe('a\\%b@x.com');
  });

  it('escapes a literal backslash before anything else', () => {
    expect(emailIlikePattern('a\\b@x.com')).toBe('a\\\\b@x.com');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(emailIlikePattern('a_b_c@x.com')).toBe('a\\_b\\_c@x.com');
  });

  it('leaves an ordinary address untouched', () => {
    expect(emailIlikePattern('faculty@jkkn.ac.in')).toBe('faculty@jkkn.ac.in');
    expect(emailIlikePattern('monisha.r@jkkn.ac.in')).toBe('monisha.r@jkkn.ac.in');
  });

  it('trims surrounding whitespace', () => {
    expect(emailIlikePattern('  a_b@x.com  ')).toBe('a\\_b@x.com');
  });

  it('never widens a match: the escaped pattern has no unescaped wildcard left', () => {
    for (const raw of ['a_b@x.com', '%@x.com', 'a\\_%b@x.com', 'plain@x.com']) {
      const out = emailIlikePattern(raw);
      // Strip escaped pairs, then assert nothing wildcard-ish survives.
      expect(out.replace(/\\[\\%_]/g, '')).not.toMatch(/[%_]/);
    }
  });
});
