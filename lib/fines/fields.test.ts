import { describe, it, expect } from 'vitest';
import { parseFineRatesBody, parseCreateFineBody } from './fields';

const YEAR = '11111111-1111-1111-1111-111111111111';
const STOP = '22222222-2222-2222-2222-222222222222';
const PERSON = '33333333-3333-3333-3333-333333333333';

describe('parseFineRatesBody', () => {
  it('accepts a valid sheet and coerces numeric strings', () => {
    const out = parseFineRatesBody({ year: YEAR, rates: [{ stop_id: STOP, fine_amount: '500' }] });
    expect(out).toEqual({ ok: true, year: YEAR, rates: [{ stop_id: STOP, fine_amount: 500 }] });
  });

  it('treats a blank amount as a clear, not a zero', () => {
    const out = parseFineRatesBody({ year: YEAR, rates: [{ stop_id: STOP, fine_amount: '' }] });
    expect(out).toEqual({ ok: true, year: YEAR, rates: [{ stop_id: STOP, fine_amount: null }] });
  });

  it('rejects a negative amount', () => {
    const out = parseFineRatesBody({ year: YEAR, rates: [{ stop_id: STOP, fine_amount: -1 }] });
    expect(out.ok).toBe(false);
  });

  it('rejects a missing year', () => {
    expect(parseFineRatesBody({ rates: [] }).ok).toBe(false);
  });

  it('ignores keys that are not on the whitelist', () => {
    const out = parseFineRatesBody({
      year: YEAR,
      rates: [{ stop_id: STOP, fine_amount: 5, created_by: 'hacker' }],
    });
    expect(out).toEqual({ ok: true, year: YEAR, rates: [{ stop_id: STOP, fine_amount: 5 }] });
  });
});

describe('parseCreateFineBody', () => {
  const good = {
    transport_year_id: YEAR,
    person_ids: [PERSON],
    due_date: '2026-09-04',
    reason: 'Late payment',
    notify: true,
    idempotency_key: 'abc-123',
  };

  it('accepts a valid body', () => {
    const out = parseCreateFineBody(good);
    expect(out).toEqual({ ok: true, value: good });
  });

  it('never accepts a client-supplied amount', () => {
    const out = parseCreateFineBody({ ...good, fine_amount: 999999 });
    expect(out.ok).toBe(true);
    expect(out.ok && 'fine_amount' in out.value).toBe(false);
  });

  it('requires a non-empty reason', () => {
    expect(parseCreateFineBody({ ...good, reason: '   ' }).ok).toBe(false);
  });

  it('requires at least one person', () => {
    expect(parseCreateFineBody({ ...good, person_ids: [] }).ok).toBe(false);
  });

  it('rejects a due date that is not yyyy-mm-dd', () => {
    expect(parseCreateFineBody({ ...good, due_date: '04/09/2026' }).ok).toBe(false);
  });

  it('requires an idempotency key', () => {
    expect(parseCreateFineBody({ ...good, idempotency_key: '' }).ok).toBe(false);
  });

  it('defaults notify to false when absent', () => {
    const { notify, ...rest } = good;
    const out = parseCreateFineBody(rest);
    expect(out.ok && out.value.notify).toBe(false);
  });

  it('dedupes repeated person ids', () => {
    const out = parseCreateFineBody({ ...good, person_ids: [PERSON, PERSON] });
    expect(out.ok && out.value.person_ids).toEqual([PERSON]);
  });
});
