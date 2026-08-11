import { describe, it, expect } from 'vitest';
import { applyOverrides, type TermOverride } from './overrides';
import type { BillableTerm } from './resolve-terms';

const TERMS: BillableTerm[] = [
  { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31' },
  { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-08-31' },
];

describe('applyOverrides', () => {
  it('returns the SAME array when there are no overrides', () => {
    // Reference equality matters: resolvePersonTerms' flat branch returns
    // ctx.flatTerms directly, and its characterization test asserts on that
    // exact array. Copying here would not break it, but allocating per person
    // across ~1,100 learners is pure waste.
    const out = applyOverrides(TERMS, []);
    expect(out).toBe(TERMS);
  });

  it('replaces the amount of a billable overridden term', () => {
    const out = applyOverrides(TERMS, [{ term_no: 1, billable: true, amount: 500 }]);
    expect(out).toEqual([
      { term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-07-31' },
      { term_no: 2, term_label: 'Term 2', amount: 2500, due_date: '2026-08-31' },
    ]);
  });

  it('keeps the term label and due date when replacing an amount', () => {
    const out = applyOverrides(TERMS, [{ term_no: 2, billable: true, amount: 1 }]);
    expect(out[1].term_label).toBe('Term 2');
    expect(out[1].due_date).toBe('2026-08-31');
  });

  it('drops a term marked not billable', () => {
    const out = applyOverrides(TERMS, [{ term_no: 2, billable: false, amount: null }]);
    expect(out).toEqual([
      { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31' },
    ]);
  });

  it('applies SOORIYA\'s rule: Term 1 becomes 500 and Term 2 disappears', () => {
    const overrides: TermOverride[] = [
      { term_no: 1, billable: true, amount: 500 },
      { term_no: 2, billable: false, amount: null },
    ];
    const out = applyOverrides(TERMS, overrides);
    expect(out).toEqual([
      { term_no: 1, term_label: 'Term 1', amount: 500, due_date: '2026-07-31' },
    ]);
    expect(out.reduce((s, t) => s + t.amount, 0)).toBe(500);
  });

  it('may drop every term — billing nothing is a legal outcome', () => {
    const out = applyOverrides(TERMS, [
      { term_no: 1, billable: false, amount: null },
      { term_no: 2, billable: false, amount: null },
    ]);
    expect(out).toEqual([]);
  });

  it('ignores an override for a term the structure does not have', () => {
    // A term cannot be invented: there is no due date to give it.
    const out = applyOverrides(TERMS, [{ term_no: 7, billable: true, amount: 999 }]);
    expect(out).toEqual(TERMS);
  });

  it('falls back to the structure amount if billable but amount is null', () => {
    // The DB check constraint makes this unreachable, but if it ever happens the
    // safe direction is to over-bill visibly, never to silently bill zero.
    const out = applyOverrides(TERMS, [{ term_no: 1, billable: true, amount: null }]);
    expect(out[0].amount).toBe(3000);
  });

  it('bills a genuine zero override rather than treating it as missing', () => {
    const out = applyOverrides(TERMS, [{ term_no: 1, billable: true, amount: 0 }]);
    expect(out[0].amount).toBe(0);
  });

  it('does not mutate its inputs', () => {
    const terms: BillableTerm[] = [
      { term_no: 1, term_label: 'Term 1', amount: 3000, due_date: '2026-07-31' },
    ];
    const snapshot = JSON.parse(JSON.stringify(terms));
    applyOverrides(terms, [{ term_no: 1, billable: true, amount: 500 }]);
    expect(terms).toEqual(snapshot);
  });
});
