/**
 * scan-dedupe — decides whether a camera read is a fresh scan or the same card
 * seen again. Pure: no React, no clock of its own (the caller passes `now`).
 *
 * WHY. The camera decodes whatever QR is in view about ten times a second, so
 * a card held up for three seconds arrives as ~30 identical reads. The dialog's
 * only other guard is a 1.5s cooldown after each request; once that lapses with
 * the card still in view, the same card was re-submitted. The server correctly
 * wrote nothing, but its "already marked" reply replaced the "Marked present"
 * confirmation the staffer was still reading — seen in production as a second
 * scan of the same learner 2.6s after the first (a ~1s request plus the 1.5s
 * cooldown), from a staffer who had only scanned once.
 *
 * THE RULE. Ignore a read of the code most recently seen until that code has
 * been out of view for `gapMs`. Every read — ignored or not — refreshes the
 * clock, so a card held in view is never re-submitted however long it stays,
 * while a card taken away and presented again is.
 */

/** How long a card must be out of view before the same card counts as a new scan. */
export const SAME_CARD_GAP_MS = 4_000;

export interface LastRead {
  code: string;
  at: number;
}

export function noteRead(
  last: LastRead | null,
  code: string,
  now: number,
  gapMs: number = SAME_CARD_GAP_MS,
): { ignore: boolean; last: LastRead } {
  const ignore = last !== null && last.code === code && now - last.at < gapMs;
  return { ignore, last: { code, at: now } };
}
