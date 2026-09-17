import { describe, it, expect } from 'vitest';
import { activeAnnualFeeRange, type AnnualRangeInput } from './annual-range';

const flat = (amount: number, status = 'active'): AnnualRangeInput => ({
  status,
  fee_mode: 'flat',
  total_amount: amount,
});

describe('activeAnnualFeeRange', () => {
  it('returns null when nothing is active', () => {
    expect(activeAnnualFeeRange([])).toBeNull();
    expect(activeAnnualFeeRange([flat(5500, 'inactive')])).toBeNull();
  });

  it('spans flat, tiered bands and stop-wise rates — never sums them', () => {
    const range = activeAnnualFeeRange([
      flat(5500),
      { status: 'active', fee_mode: 'tiered', total_amount: 0, bands: [{ total_amount: 500 }, { total_amount: 5000 }] },
      { status: 'active', fee_mode: 'stop_wise', total_amount: 0, stop_rate_range: { min: 4400, max: 30250 } },
    ]);
    expect(range).toEqual({ min: 500, max: 30250 });
  });

  it('ignores the 0 placeholder total on tiered and stop-wise rows', () => {
    expect(
      activeAnnualFeeRange([
        flat(5500),
        { status: 'active', fee_mode: 'tiered', total_amount: 0, bands: [] },
        { status: 'active', fee_mode: 'stop_wise', total_amount: 0, stop_rate_range: null },
      ])
    ).toEqual({ min: 5500, max: 5500 });
  });

  it('skips inactive structures', () => {
    expect(activeAnnualFeeRange([flat(5500), flat(99999, 'inactive')])).toEqual({ min: 5500, max: 5500 });
  });

  it('accepts numeric strings as Postgres numerics arrive', () => {
    expect(
      activeAnnualFeeRange([{ status: 'active', fee_mode: 'flat', total_amount: '5500.00' as unknown as number }])
    ).toEqual({ min: 5500, max: 5500 });
  });
});
