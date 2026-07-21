// lib/fees/stop-rate.ts
// Money maths for stop_wise fee structures.
//
// A stop carries ONE annual amount. The structure carries ONE instalment
// schedule expressed as percentage shares. Splitting the annual across those
// shares must be exact: sum(terms) === annual, always.

/** Rounding tolerance for share sums — floats make 33.33*3 unreliable. */
const SHARE_EPSILON = 0.01;

/**
 * Split an annual amount across percentage shares.
 *
 * Every term but the last is rounded to whole rupees; the LAST term absorbs the
 * remainder so the terms always re-add to `annual` exactly. Distributing the
 * remainder any other way lets the billed total drift from the agreed fee —
 * invisible at generation, surfacing later as an unclearable balance.
 */
export function splitAnnual(annual: number, shares: number[]): number[] {
  if (!shares.length) {
    throw new Error('A stop_wise structure needs at least one term.');
  }
  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < shares.length - 1; i++) {
    const part = Math.round((annual * shares[i]) / 100);
    out.push(part);
    assigned += part;
  }
  out.push(annual - assigned);
  return out;
}

/** Null when the schedule is valid, else a human-readable reason. */
export function validateShares(shares: number[]): string | null {
  if (!shares.length) return 'A stop_wise structure needs at least one term.';
  if (shares.some((s) => !(s > 0))) return 'Every term share must be greater than 0.';
  const total = shares.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > SHARE_EPSILON) {
    return `Term shares must sum to 100 (currently ${total}).`;
  }
  return null;
}
