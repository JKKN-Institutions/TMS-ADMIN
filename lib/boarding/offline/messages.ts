/**
 * What to tell the staffer after a sync. A handful of marks get a line each,
 * so a tap made with signal reads exactly like before offline support. A
 * backlog sent after signal returns gets ONE summary line, not thirty toasts.
 */
import { REJECT_REASON_TEXT, isSavedOutcome } from './protocol';
import type { SyncOutcome } from './sync';

export interface SyncMessage { kind: 'success' | 'warning'; text: string }

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function syncMessages(outcomes: SyncOutcome[]): SyncMessage[] {
  if (outcomes.length === 0) return [];
  const failed = outcomes.filter((o) => !isSavedOutcome(o.result.outcome));

  if (outcomes.length > 3) {
    const saved = outcomes.length - failed.length;
    return [{
      kind: failed.length > 0 ? 'warning' : 'success',
      text: `Sent ${saved} saved mark${saved === 1 ? '' : 's'}.` +
        (failed.length > 0 ? ` ${failed.length} not saved — see "Not saved" on this page.` : ''),
    }];
  }

  return outcomes.map(({ entry, result }): SyncMessage => {
    const who = entry.name ?? 'Student';
    const status = entry.kind === 'mark' ? entry.status : 'present';
    if (result.outcome === 'locked') {
      return { kind: 'warning', text: `${who}: not saved — already marked by ${result.markedByName}.` };
    }
    if (result.outcome === 'rejected') {
      return { kind: 'warning', text: `${who}: not saved — ${lowerFirst(result.message ?? REJECT_REASON_TEXT[result.reason])}` };
    }
    if (result.outcome === 'noop_same_status') return { kind: 'success', text: `${who} was already marked ${status}.` };
    if (result.outcome === 'inserted' && result.walkUp) {
      return { kind: 'success', text: `${who} recorded as travelling without a ticket. They have been notified.` };
    }
    return { kind: 'success', text: `Marked ${who} ${status}.` };
  });
}
