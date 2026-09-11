/**
 * One answer per mark, keyed by the id the phone generated.
 *
 * The outbox on a boarding staffer's phone sends marks in batches and must
 * settle each one individually: remove what was saved, show what a colleague
 * holds, keep what was refused in a "Not saved" list. The route's aggregate
 * counts cannot do that, so it also returns this list.
 *
 * Pure. `sent[i]` MUST be the mark that produced `outcomes[i]` -- the RPC
 * answers one row per mark in request order.
 */
import type { RpcMarkOutcome } from './mark-batch';
import { isSavedOutcome, type MarkRejectReason, type MarkResult } from './offline/protocol';

export function buildMarkResults(args: {
  rejected: Array<{ clientId?: string; reason: MarkRejectReason }>;
  sent: Array<{ clientId?: string; walkUp: boolean }>;
  outcomes: RpcMarkOutcome[];
  markerName: (profileId: string | null) => string;
}): MarkResult[] {
  const results: MarkResult[] = [];

  for (const r of args.rejected) {
    if (r.clientId) results.push({ clientId: r.clientId, outcome: 'rejected', reason: r.reason });
  }

  args.outcomes.forEach((o, i) => {
    const mark = args.sent[i];
    if (!mark?.clientId) return;
    if (o.outcome === 'locked') {
      results.push({ clientId: mark.clientId, outcome: 'locked', markedByName: args.markerName(o.existing_by) });
    } else if (isSavedOutcome(o.outcome)) {
      results.push({ clientId: mark.clientId, outcome: o.outcome, walkUp: mark.walkUp });
    }
  });

  return results;
}
