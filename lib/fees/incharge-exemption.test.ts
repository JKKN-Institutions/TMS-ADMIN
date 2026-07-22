import { describe, it, expect } from 'vitest';
import { filterOutInCharges } from './incharge-exemption';

const p = (person_id: string, ...emails: Array<string | null>) => ({ person_id, emails });

describe('filterOutInCharges', () => {
  it('removes staff who hold an active in-charge assignment', () => {
    const r = filterOutInCharges(
      [p('s1', 'a@jkkn.ac.in'), p('s2', 'b@jkkn.ac.in')],
      ['a@jkkn.ac.in']
    );
    expect(r.kept.map((x) => x.person_id)).toEqual(['s2']);
    expect(r.exemptCount).toBe(1);
  });

  it('matches regardless of email casing on EITHER side', () => {
    // tms_staff_route_assignment stores staff_email free-form; staff.email may
    // differ in case. A case-sensitive compare would exempt nobody and bill
    // every in-charge.
    const r = filterOutInCharges(
      [p('s1', 'Alice.B@JKKN.ac.in')],
      ['alice.b@jkkn.ac.in']
    );
    expect(r.kept).toEqual([]);
    expect(r.exemptCount).toBe(1);
  });

  it('tolerates surrounding whitespace in the assignment email', () => {
    const r = filterOutInCharges([p('s1', 'a@jkkn.ac.in')], ['  a@jkkn.ac.in  ']);
    expect(r.exemptCount).toBe(1);
  });

  it('keeps everyone when there are no in-charges', () => {
    const r = filterOutInCharges([p('s1', 'a@jkkn.ac.in'), p('s2', 'b@jkkn.ac.in')], []);
    expect(r.kept).toHaveLength(2);
    expect(r.exemptCount).toBe(0);
  });

  it('keeps a person with a null email rather than silently exempting them', () => {
    // A missing email must not be treated as "matches nothing special" in a way
    // that drops them; they are billable and must stay in the cohort.
    const r = filterOutInCharges([p('s1', null)], ['a@jkkn.ac.in']);
    expect(r.kept.map((x) => x.person_id)).toEqual(['s1']);
    expect(r.exemptCount).toBe(0);
  });

  it('ignores blank entries in the in-charge list', () => {
    // A blank staff_email must never match a person with a null/blank email.
    const r = filterOutInCharges([p('s1', null), p('s2', '')], ['', '   ']);
    expect(r.kept).toHaveLength(2);
    expect(r.exemptCount).toBe(0);
  });

  it('counts each exempted person once even if listed twice', () => {
    const r = filterOutInCharges([p('s1', 'a@jkkn.ac.in')], ['a@jkkn.ac.in', 'A@jkkn.ac.in']);
    expect(r.kept).toEqual([]);
    expect(r.exemptCount).toBe(1);
  });

  it('preserves the order of the kept people', () => {
    const r = filterOutInCharges(
      [p('s1', 'a@x'), p('s2', 'b@x'), p('s3', 'c@x')],
      ['b@x']
    );
    expect(r.kept.map((x) => x.person_id)).toEqual(['s1', 's3']);
  });

  // --- C1: staff.email and profiles.email diverge; the self-assign path
  // writes the assignment from profiles.email, so a person must be exempted
  // via EITHER address they are known by. ------------------------------------

  it('exempts a person via their SECOND email when the first does not match (C1)', () => {
    // e.g. emails[0] = staff.email (personal, does not match the assignment),
    // emails[1] = profiles.email (institutional, written by self-assign).
    const r = filterOutInCharges(
      [p('s1', 'personal@gmail.com', 'institutional@jkkn.ac.in')],
      ['institutional@jkkn.ac.in']
    );
    expect(r.kept).toEqual([]);
    expect(r.exemptCount).toBe(1);
  });

  it('keeps a person whose every known address is null', () => {
    const r = filterOutInCharges([p('s1', null, null)], ['a@jkkn.ac.in']);
    expect(r.kept.map((x) => x.person_id)).toEqual(['s1']);
    expect(r.exemptCount).toBe(0);
  });

  it('keeps a person with no known addresses at all', () => {
    const r = filterOutInCharges([p('s1')], ['a@jkkn.ac.in']);
    expect(r.kept.map((x) => x.person_id)).toEqual(['s1']);
    expect(r.exemptCount).toBe(0);
  });

  // --- I4: unmatchedInCharge is the denominator that exposes partial failure --

  it('reports zero unmatched in-charges when every assignment matches someone', () => {
    const r = filterOutInCharges([p('s1', 'a@jkkn.ac.in')], ['a@jkkn.ac.in']);
    expect(r.unmatchedInCharge).toBe(0);
  });

  it('counts an active in-charge assignment that matches nobody in the cohort', () => {
    // 2 active assignments, only 1 matches a cohort member -- exemptCount
    // alone (1) reads identically whether the other assignment matched or not.
    const r = filterOutInCharges(
      [p('s1', 'a@jkkn.ac.in')],
      ['a@jkkn.ac.in', 'ghost@jkkn.ac.in']
    );
    expect(r.exemptCount).toBe(1);
    expect(r.unmatchedInCharge).toBe(1);
  });

  it('counts distinct unmatched in-charge emails once, even if repeated with different casing', () => {
    const r = filterOutInCharges(
      [p('s1', 'a@jkkn.ac.in')],
      ['ghost@jkkn.ac.in', 'GHOST@jkkn.ac.in']
    );
    expect(r.unmatchedInCharge).toBe(1);
  });
});
