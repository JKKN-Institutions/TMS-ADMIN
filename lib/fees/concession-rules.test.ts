import { describe, it, expect } from 'vitest';
import { parseRuleInput } from './concession-rules';

describe('parseRuleInput', () => {
  it('accepts a final_year rule and clears annual_amount', () => {
    const r = parseRuleInput({ kind: 'final_year', institution_id: 'i', admission_year: '2022', percent: 50, label: ' Pharm ', annual_amount: 9 });
    expect(r).toEqual({ ok: true, value: {
      kind: 'final_year', institution_id: 'i', admission_year: 2022, program_id: null,
      percent: 50, annual_amount: null, label: 'Pharm', is_active: true,
    } });
  });
  it('rejects final_year without institution, year, or with percent out of range', () => {
    expect(parseRuleInput({ kind: 'final_year', admission_year: 2022, percent: 50, label: 'x' }).ok).toBe(false);
    expect(parseRuleInput({ kind: 'final_year', institution_id: 'i', percent: 50, label: 'x' }).ok).toBe(false);
    expect(parseRuleInput({ kind: 'final_year', institution_id: 'i', admission_year: 2022, percent: 100, label: 'x' }).ok).toBe(false);
  });
  it('accepts scheme_75 and clears cohort fields', () => {
    const r = parseRuleInput({ kind: 'scheme_75', annual_amount: '500', label: '7.5%', institution_id: 'i' });
    expect(r).toEqual({ ok: true, value: {
      kind: 'scheme_75', institution_id: null, admission_year: null, program_id: null,
      percent: null, annual_amount: 500, label: '7.5%', is_active: true,
    } });
  });
  it('rejects scheme_75 with a non-positive amount, unknown kinds and blank labels', () => {
    expect(parseRuleInput({ kind: 'scheme_75', annual_amount: 0, label: 'x' }).ok).toBe(false);
    expect(parseRuleInput({ kind: 'other', label: 'x' }).ok).toBe(false);
    expect(parseRuleInput({ kind: 'scheme_75', annual_amount: 500, label: '  ' }).ok).toBe(false);
  });
  it('honours is_active=false', () => {
    const r = parseRuleInput({ kind: 'scheme_75', annual_amount: 500, label: 'x', is_active: false });
    expect(r.ok && r.value.is_active).toBe(false);
  });
});
