/**
 * What the inspector hears after a Bus Inspection scan, so they can keep their
 * eyes on the next learner instead of the phone. Pure: no speech here — the
 * dialog passes the phrase to lib/boarding/announce's speak(), which owns the
 * voice, the iPhone unlock and the mute switch.
 */
import { spokenName } from '@/lib/boarding/announce';
import type { CheckOutcome } from './outcome';

const OUTCOME_WORDS: Record<Exclude<CheckOutcome, 'unknown_card'>, string> = {
  ok: 'OK',
  not_on_route: 'not on this bus',
  no_booking: 'no booking',
  fee_unpaid: 'fee unpaid',
  manual: 'checked',
};

/** Said when the server could not record the scan. */
export const CHECK_ERROR_PHRASE = 'Not checked, try again';

export function checkAnnouncement(input: {
  name: string | null | undefined;
  outcome: CheckOutcome;
  /** Already ticked earlier in this check; nothing new was written. */
  alreadyChecked: boolean;
}): string {
  if (input.outcome === 'unknown_card') return 'Card not recognised';
  const who = spokenName(input.name) || 'Person';
  if (input.alreadyChecked) return `${who}, already checked`;
  return `${who}, ${OUTCOME_WORDS[input.outcome]}`;
}
