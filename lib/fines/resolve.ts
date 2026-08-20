// lib/fines/resolve.ts
// Pure money maths for a manual fine: a learner's boarding stop chooses the
// amount. Unresolvable learners are SKIPPED and reported, never guessed and
// never silently priced at zero — the reason codes mirror
// lib/fees/resolve-terms.ts so the same words reach the operator.

export type FineSkipReason = 'no_stop' | 'no_stop_rate';

export const FINE_SKIP_LABEL: Record<FineSkipReason, string> = {
  no_stop: 'No boarding stop on record',
  no_stop_rate: 'No fine configured for this stop',
};

export type FineResolution =
  | { ok: true; amount: number; stop_id: string }
  | { ok: false; reason: FineSkipReason };

export function resolveFine(
  learner: { transport_stop_id: string | null },
  rateByStop: Map<string, number>
): FineResolution {
  const stopId = learner.transport_stop_id;
  if (!stopId) return { ok: false, reason: 'no_stop' };

  const amount = rateByStop.get(stopId);
  // A configured 0 is treated as "not priced": a ₹0 bill is noise on the
  // learner's statement and cannot be collected, so it is never raised.
  if (amount === undefined || !(amount > 0)) return { ok: false, reason: 'no_stop_rate' };

  return { ok: true, amount, stop_id: stopId };
}
