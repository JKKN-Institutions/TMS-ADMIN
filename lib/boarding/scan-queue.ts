/**
 * scan-queue — decides what the scanner does with each camera read so that
 * learners can present cards one after another without the staffer touching
 * the phone. Pure: no React, no clock of its own (the caller passes `now`).
 *
 * WHY. The earlier guard (scan-dedupe.ts) remembered only ONE card, and a
 * separate "busy" flag dropped every read that arrived while a save was in
 * flight. Together they lost the next learner: card B, read while card A was
 * saving, was remembered as "seen" but never sent, and because every read
 * refreshes the clock it stayed ignored for as long as B was held up. Staff
 * had to take the card away for four seconds and show it again.
 *
 * THE RULES.
 * - A card seen within `gapMs` is the same presentation: ignored. Every read
 *   refreshes its clock, so a card held in view is never sent twice. This is
 *   tracked PER CARD, so card A still in view while B is sent is not re-sent.
 * - A new card read while another is saving is QUEUED, not dropped, and is
 *   sent the moment the save finishes.
 * - A card whose request failed on the network is forgotten, so holding it up
 *   again retries it.
 */

import { SAME_CARD_GAP_MS } from './scan-dedupe';

/** A handful is plenty: a queue this long means the network has stalled. */
export const MAX_QUEUED = 5;

export interface ScanQueueState {
  /** When each card was last in view. */
  seen: Map<string, number>;
  /** The card being saved right now. */
  inFlight: string | null;
  /** Cards read while another was saving, oldest first. */
  queue: string[];
}

export type ReadAction = 'submit' | 'queued' | 'ignore';

export function createScanQueue(): ScanQueueState {
  return { seen: new Map(), inFlight: null, queue: [] };
}

/** A camera read arrived. Mutates `state`; returns what to do with `code`. */
export function onRead(
  state: ScanQueueState,
  code: string,
  now: number,
  gapMs: number = SAME_CARD_GAP_MS,
): ReadAction {
  for (const [c, at] of state.seen) {
    if (now - at >= gapMs) state.seen.delete(c);
  }
  const recentlySeen = state.seen.has(code);
  state.seen.set(code, now);

  if (recentlySeen || state.inFlight === code || state.queue.includes(code)) return 'ignore';
  if (state.inFlight !== null) {
    if (state.queue.length >= MAX_QUEUED) {
      // Not remembered, so it is picked up again once the queue drains.
      state.seen.delete(code);
      return 'ignore';
    }
    state.queue.push(code);
    return 'queued';
  }
  state.inFlight = code;
  return 'submit';
}

/**
 * The save for the in-flight card finished. Returns the next card to send, if
 * any. `failed` means the request got no answer: that card is forgotten so it
 * can be retried by holding it up again.
 */
export function onDone(state: ScanQueueState, now: number, failed = false): string | null {
  if (state.inFlight !== null) {
    if (failed) state.seen.delete(state.inFlight);
    // The card was in view at least until its save finished; start its
    // same-card gap from here so a slow save cannot re-send it.
    else state.seen.set(state.inFlight, now);
  }
  const next = state.queue.shift() ?? null;
  state.inFlight = next;
  return next;
}

/** A new scanning session (dialog reopened): forget everything. */
export function resetScanQueue(state: ScanQueueState): void {
  state.seen.clear();
  state.inFlight = null;
  state.queue = [];
}
