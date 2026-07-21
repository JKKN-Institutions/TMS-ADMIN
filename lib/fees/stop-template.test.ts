import { describe, it, expect } from 'vitest';
import {
  buildTemplateRows,
  parseImportRows,
  TEMPLATE_HEADERS,
  type TemplateStop,
} from './stop-template';

const STOPS: TemplateStop[] = [
  { stop_id: 's1', stop_name: 'KACHU PALLI', sequence_order: 3, route_number: '37', route_name: 'THULASAMPATTI' },
  { stop_id: 's2', stop_name: 'METTUPALAYAM', sequence_order: 4, route_number: '37', route_name: 'THULASAMPATTI' },
];
const known = new Map(STOPS.map((s) => [s.stop_id, s]));

describe('buildTemplateRows', () => {
  it('emits one row per stop with a blank amount when unconfigured', () => {
    const rows = buildTemplateRows(STOPS, new Map());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      route_number: '37',
      route_name: 'THULASAMPATTI',
      sequence_order: 3,
      stop_name: 'KACHU PALLI',
      stop_id: 's1',
      annual_amount: '',
    });
  });

  it('pre-fills amounts that are already configured', () => {
    const rows = buildTemplateRows(STOPS, new Map([['s1', 9900]]));
    expect(rows[0].annual_amount).toBe(9900);
    expect(rows[1].annual_amount).toBe('');
  });

  it('exposes headers matching the row keys', () => {
    const rows = buildTemplateRows(STOPS, new Map());
    expect(Object.keys(rows[0])).toEqual(TEMPLATE_HEADERS);
  });
});

describe('parseImportRows', () => {
  it('accepts a well-formed row', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: 9900 }],
      known
    );
    expect(errors).toEqual([]);
    expect(rates).toEqual([{ stop_id: 's1', annual_amount: 9900 }]);
  });

  it('skips a blank amount without erroring — partial fills are allowed', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: '' }],
      known
    );
    expect(errors).toEqual([]);
    expect(rates).toEqual([]);
  });

  it('rejects an unknown stop_id', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 'nope', route_number: '37', stop_name: 'X', annual_amount: 100 }],
      known
    );
    expect(rates).toEqual([]);
    expect(errors[0].message).toMatch(/unknown stop_id/i);
    expect(errors[0].row).toBe(2); // header is row 1
  });

  it('rejects a row whose stop_name no longer matches the stop_id', () => {
    // The tripwire: rows reordered or a column pasted over.
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'METTUPALAYAM', annual_amount: 100 }],
      known
    );
    expect(rates).toEqual([]);
    expect(errors[0].message).toMatch(/does not match/i);
  });

  it('rejects a row whose route_number no longer matches', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '13', stop_name: 'KACHU PALLI', annual_amount: 100 }],
      known
    );
    expect(rates).toEqual([]);
    expect(errors[0].message).toMatch(/does not match/i);
  });

  it('rejects a non-numeric amount', () => {
    const { errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: 'nine thousand' }],
      known
    );
    expect(errors[0].message).toMatch(/not a number/i);
  });

  it('rejects a negative amount', () => {
    const { errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: -5 }],
      known
    );
    expect(errors[0].message).toMatch(/cannot be negative/i);
  });

  it('rejects a duplicate stop_id rather than silently taking the last', () => {
    const { errors } = parseImportRows(
      [
        { stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: 100 },
        { stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: 200 },
      ],
      known
    );
    expect(errors[0].message).toMatch(/duplicate/i);
  });

  it('collects every bad row rather than stopping at the first', () => {
    const { errors } = parseImportRows(
      [
        { stop_id: 'nope', route_number: '37', stop_name: 'X', annual_amount: 1 },
        { stop_id: 's2', route_number: '37', stop_name: 'METTUPALAYAM', annual_amount: -1 },
      ],
      known
    );
    expect(errors).toHaveLength(2);
  });

  it('tolerates numeric strings and comma-formatted amounts from Excel', () => {
    const { rates, errors } = parseImportRows(
      [{ stop_id: 's1', route_number: '37', stop_name: 'KACHU PALLI', annual_amount: '9,900' }],
      known
    );
    expect(errors).toEqual([]);
    expect(rates).toEqual([{ stop_id: 's1', annual_amount: 9900 }]);
  });
});
