// lib/fees/annual-range.ts
// The "what does one person pay per year" range across ACTIVE fee structures,
// for the Maintenance Fee page's stat card.
//
// Never SUM structures: each person is billed under exactly one, so a sum is
// meaningless (it once read ₹11,000 = the real ₹5,500 flat fee + a leftover
// ₹5,500 "Testing" structure). And tiered / stop_wise rows keep total_amount at
// a 0 placeholder — their real prices live in bands and per-stop rates.

export interface AnnualRangeInput {
  status: string;
  fee_mode: string;
  total_amount: number;
  bands?: Array<{ total_amount: number }>;
  stop_rate_range?: { min: number; max: number } | null;
}

export function activeAnnualFeeRange(rows: AnnualRangeInput[]): { min: number; max: number } | null {
  const amounts: number[] = [];
  for (const r of rows) {
    if (r.status !== 'active') continue;
    if (r.fee_mode === 'tiered') {
      for (const b of r.bands ?? []) amounts.push(Number(b.total_amount));
    } else if (r.fee_mode === 'stop_wise') {
      if (r.stop_rate_range) amounts.push(Number(r.stop_rate_range.min), Number(r.stop_rate_range.max));
    } else {
      amounts.push(Number(r.total_amount));
    }
  }
  const valid = amounts.filter((n) => Number.isFinite(n));
  if (!valid.length) return null;
  return { min: Math.min(...valid), max: Math.max(...valid) };
}
