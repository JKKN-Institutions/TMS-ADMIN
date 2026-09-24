// Settings → Inspection Fines "if a check ran today" estimate. Pure, no I/O:
// the route gathers the facts; this runs the SAME decideFeeFine rule submit
// uses, so the estimate cannot drift from what a check would actually charge.
import { decideFeeFine } from './fine-rules';
import type { LearnerFeeFactsRow } from './fee-facts';

export interface FeeDryRun {
  /** Unpaid past due, outside any running 48h window, not yet fined this year: fined if scanned today. */
  unpaidPastDue: number;
  /** Unpaid past due but inside a running 48h payment window: not fined yet. */
  inNoticeWindow: number;
  /** Learners already holding this year's maintenance fine (any status): never fined again. */
  alreadyFinedThisYear: number;
  /** Fee facts that could not be read ('unknown'): never fined, flagged so a 0 is not trusted blindly. */
  unreadable: number;
}

export function summariseFeeDryRun(
  facts: Map<string, LearnerFeeFactsRow>,
  finedThisYear: Set<string>,
  ctx: { today: string; now: Date },
): FeeDryRun {
  let unpaidPastDue = 0, inNoticeWindow = 0, unreadable = 0;
  for (const [id, fact] of facts) {
    if (fact.mark === 'unknown') { unreadable += 1; continue; }
    const d = decideFeeFine(fact, { checkDate: ctx.today, now: ctx.now });
    if (d.raise) {
      if (!finedThisYear.has(id)) unpaidPastDue += 1;
    } else if (d.note === 'within_notice_window') {
      inNoticeWindow += 1;
    }
  }
  return { unpaidPastDue, inNoticeWindow, alreadyFinedThisYear: finedThisYear.size, unreadable };
}
