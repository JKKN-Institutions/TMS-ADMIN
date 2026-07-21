import { describe, it, expect } from 'vitest';
import { filterOutInCharges } from './incharge-exemption';

const p = (person_id: string, email: string | null) => ({ person_id, email });

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
});
