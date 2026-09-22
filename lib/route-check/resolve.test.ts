import { describe, it, expect } from 'vitest';
import { exactIlikePattern, dedupeCandidates, sortCandidates, jkknFallbackCodes, isActiveLifecycle, type Candidate } from './resolve';

const c = (over: Partial<Candidate>): Candidate => ({
  personKind: 'learner',
  id: 'x',
  name: 'X',
  code: null,
  routeId: null,
  matchedBy: 'roll_number',
  active: true,
  ...over,
});

describe('exactIlikePattern', () => {
  it('leaves a plain code unchanged', () => {
    expect(exactIlikePattern('ES24031')).toBe('ES24031');
  });
  it('escapes underscore and percent so they are literal', () => {
    expect(exactIlikePattern('AB_1%2')).toBe('AB\\_1\\%2');
  });
  it('escapes backslash first (no double escaping)', () => {
    expect(exactIlikePattern('A\\_B')).toBe('A\\\\\\_B');
  });
  it('trims whitespace', () => {
    expect(exactIlikePattern('  AB12 ')).toBe('AB12');
  });
  it('returns null for a value containing * (PostgREST turns * into %, unescapable)', () => {
    expect(exactIlikePattern('AB*12')).toBeNull();
    expect(exactIlikePattern('*')).toBeNull();
  });
  it('returns null for an empty value', () => {
    expect(exactIlikePattern('   ')).toBeNull();
  });
});

describe('dedupeCandidates', () => {
  it('keeps the first of each (kind, id) and keeps same id across kinds', () => {
    const list = [
      c({ id: '1', matchedBy: 'roll_number' }),
      c({ id: '1', matchedBy: 'register_number' }),
      c({ id: '1', personKind: 'staff', matchedBy: 'staff_id' }),
    ];
    const out = dedupeCandidates(list);
    expect(out).toHaveLength(2);
    expect(out[0].matchedBy).toBe('roll_number');
    expect(out[1].personKind).toBe('staff');
  });
});

describe('sortCandidates', () => {
  it('puts this route first, then name, then learners before staff', () => {
    const list = [
      c({ id: 'a', name: 'Zara', routeId: 'other' }),
      c({ id: 'b', name: 'bala', routeId: null }),
      c({ id: 'c', name: 'Yogi', routeId: 'R' }),
      c({ id: 'd', name: 'Arun', routeId: 'R', personKind: 'staff' }),
      c({ id: 'e', name: 'Arun', routeId: 'R' }),
    ];
    expect(sortCandidates(list, 'R').map((x) => x.id)).toEqual(['e', 'd', 'c', 'b', 'a']);
  });
  it('this route first, then active before inactive (even across names)', () => {
    const list = [
      c({ id: 'off-active', name: 'Anu', routeId: 'other', active: true }),
      c({ id: 'on-inactive', name: 'Anbu', routeId: 'R', active: false }),
      c({ id: 'on-active', name: 'Zeno', routeId: 'R', active: true }),
      c({ id: 'off-inactive', name: 'Aadhi', routeId: 'other', active: false }),
    ];
    expect(sortCandidates(list, 'R').map((x) => x.id)).toEqual(['on-active', 'on-inactive', 'off-active', 'off-inactive']);
  });
  it('does not mutate its input', () => {
    const list = [c({ id: 'a', name: 'B' }), c({ id: 'b', name: 'A' })];
    sortCandidates(list, 'R');
    expect(list.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('jkknFallbackCodes', () => {
  it('tries the bare 7 digits first, then the dashed form', () => {
    expect(jkknFallbackCodes('123457-2')).toEqual(['1234572', '123457-2']);
  });
});

describe('isActiveLifecycle', () => {
  it('active statuses are active; graduated / inactive / null are not', () => {
    expect(isActiveLifecycle('account')).toBe(true);
    expect(isActiveLifecycle('active')).toBe(true);
    expect(isActiveLifecycle('graduated')).toBe(false);
    expect(isActiveLifecycle('inactive')).toBe(false);
    expect(isActiveLifecycle(null)).toBe(false);
  });
});
