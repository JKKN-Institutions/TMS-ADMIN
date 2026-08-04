import { describe, it, expect } from 'vitest';
import { intersectPersonIds } from './person-scope';

const PEOPLE = [{ person_id: 'a' }, { person_id: 'b' }, { person_id: 'c' }];

describe('intersectPersonIds', () => {
  it('returns everyone unchanged when no ids are requested', () => {
    const r = intersectPersonIds(PEOPLE, null);
    expect(r.kept).toEqual(PEOPLE);
    expect(r.requested).toBe(0);
    expect(r.unknownIds).toEqual([]);
  });

  it('treats an empty array as no scoping', () => {
    expect(intersectPersonIds(PEOPLE, []).kept).toEqual(PEOPLE);
  });

  it('narrows the cohort to the requested ids', () => {
    const r = intersectPersonIds(PEOPLE, ['a', 'c']);
    expect(r.kept.map((p) => p.person_id)).toEqual(['a', 'c']);
    expect(r.matched).toBe(2);
  });

  it('never widens the cohort — an id outside the cohort is not added', () => {
    const r = intersectPersonIds(PEOPLE, ['a', 'zzz']);
    expect(r.kept.map((p) => p.person_id)).toEqual(['a']);
    expect(r.kept).toHaveLength(1);
  });

  it('reports ids that matched nobody', () => {
    expect(intersectPersonIds(PEOPLE, ['a', 'zzz', 'qqq']).unknownIds).toEqual(['zzz', 'qqq']);
  });

  it('deduplicates repeated ids', () => {
    const r = intersectPersonIds(PEOPLE, ['a', 'a', 'b']);
    expect(r.kept).toHaveLength(2);
    expect(r.requested).toBe(2);
  });

  it('trims and ignores blank ids', () => {
    const r = intersectPersonIds(PEOPLE, ['  a  ', '', '   ']);
    expect(r.kept.map((p) => p.person_id)).toEqual(['a']);
    expect(r.requested).toBe(1);
  });

  it('yields an empty cohort when no requested id matches', () => {
    const r = intersectPersonIds(PEOPLE, ['zzz']);
    expect(r.kept).toEqual([]);
    expect(r.matched).toBe(0);
    expect(r.unknownIds).toEqual(['zzz']);
  });
});
