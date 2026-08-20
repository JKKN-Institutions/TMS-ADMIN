import { describe, it, expect } from 'vitest';
import { FINE_TEMPLATE_HEADERS, buildFineTemplateRows, parseFineImportRows } from './fine-template';
import type { TemplateStop } from '@/lib/fees/stop-template';

const stop: TemplateStop = {
  stop_id: 'stop-1',
  stop_name: 'EADAPPADI',
  sequence_order: 3,
  route_number: '10',
  route_name: 'EADAPPADI - COLLEGE',
};
const known = new Map<string, TemplateStop>([[stop.stop_id, stop]]);

describe('buildFineTemplateRows', () => {
  it('uses a fine_amount column, not annual_amount', () => {
    expect(FINE_TEMPLATE_HEADERS).toContain('fine_amount');
    expect(FINE_TEMPLATE_HEADERS).not.toContain('annual_amount');
  });

  it('pre-fills the existing fine and leaves unpriced stops blank', () => {
    const [priced] = buildFineTemplateRows([stop], new Map([['stop-1', 500]]));
    expect(priced.fine_amount).toBe(500);
    const [blank] = buildFineTemplateRows([stop], new Map());
    expect(blank.fine_amount).toBe('');
  });
});

describe('parseFineImportRows', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    route_number: '10',
    route_name: 'EADAPPADI - COLLEGE',
    sequence_order: 3,
    stop_name: 'EADAPPADI',
    stop_id: 'stop-1',
    fine_amount: 500,
    ...over,
  });

  it('parses a good row into a fine_amount rate', () => {
    const out = parseFineImportRows([row()], known);
    expect(out.errors).toEqual([]);
    expect(out.rates).toEqual([{ stop_id: 'stop-1', fine_amount: 500 }]);
  });

  it('treats a blank amount as a clear', () => {
    const out = parseFineImportRows([row({ fine_amount: '' })], known);
    expect(out.clears).toEqual(['stop-1']);
    expect(out.rates).toEqual([]);
  });

  it('rejects a row whose stop_name no longer matches its stop_id', () => {
    const out = parseFineImportRows([row({ stop_name: 'SOMEWHERE ELSE' })], known);
    expect(out.errors).toHaveLength(1);
    expect(out.rates).toEqual([]);
  });

  it('rejects a non-numeric amount', () => {
    const out = parseFineImportRows([row({ fine_amount: 'five hundred' })], known);
    expect(out.errors).toHaveLength(1);
  });
});
