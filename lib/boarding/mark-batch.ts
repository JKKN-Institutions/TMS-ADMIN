/**
 * Pure shaping of a batch mark result into an HTTP response and a user message.
 *
 * POST /api/boarding/attendance takes an ARRAY of marks, and after the
 * ownership gate a batch can come back mixed: some rows written, some already
 * carrying the requested status, some held by a colleague. Deciding what that
 * means — success or failure, and what to tell the person — is real logic, and
 * while it lived inline in the route handler nothing could test it.
 *
 * The governing rule: a batch that changed ANYTHING is a success. One taken row
 * must not fail the other nineteen. But a success must never be reported as if
 * it were total — a locked row the caller cannot see is how a colleague's mark
 * gets quietly assumed-away.
 *
 * No I/O — the route gathers the RPC's per-learner outcomes, this decides.
 */

export type MarkOutcomeKind =
  | 'inserted'
  | 'updated_own'
  | 'overridden'
  | 'noop_same_status'
  | 'locked';

/** One learner's row from the tms_mark_attendance RPC. */
export interface RpcMarkOutcome {
  learner_id: string;
  outcome: MarkOutcomeKind;
  /** The row as it was when the call reached it; for a locked row, what still stands. */
  existing_status: 'present' | 'absent' | null;
  existing_by: string | null;
  existing_at: string | null;
}

/** A mark this request could not write because a colleague holds it. */
export interface LockedMark {
  learnerId: string;
  status: 'present' | 'absent' | null;
  /** Raw profiles.id. Resolved to a name by the route, then STRIPPED before responding. */
  markedBy: string | null;
  markedAt: string | null;
}

export interface MarkBatchSummary {
  /** Rows this call actually changed. */
  written: number;
  /** Rows already carrying the requested status — nothing to do, not a failure. */
  skipped: number;
  /** Of `written`, how many replaced someone else's differing mark. */
  overrides: number;
  locked: LockedMark[];
  /**
   * Marks that never reached the database at all — filtered out beforehand for
   * not belonging to the route, or carrying an unusable status. Counted so the
   * response cannot imply more happened than did.
   */
  dropped: number;
  /**
   * 'ok'          → 200. Something changed, or nothing needed to.
   * 'all_locked'  → 409. Nothing changed and the ONLY reason was ownership.
   *
   * The distinction matters because 409 is a dead end the client must surface,
   * while a partial success is a normal outcome that should still refresh the
   * roster rather than throw.
   */
  disposition: 'ok' | 'all_locked';
}

/**
 * @param results   one row per mark that reached the RPC, in request order
 * @param requested how many marks the caller actually asked for, INCLUDING any
 *                  dropped before the RPC — pass `marks.length`, not the
 *                  filtered array's length, or `dropped` silently reads zero.
 */
export function summarizeMarkBatch(
  results: RpcMarkOutcome[],
  requested: number,
): MarkBatchSummary {
  const written = results.filter(
    (r) => r.outcome !== 'locked' && r.outcome !== 'noop_same_status',
  ).length;
  const skipped = results.filter((r) => r.outcome === 'noop_same_status').length;
  const overrides = results.filter((r) => r.outcome === 'overridden').length;
  const locked: LockedMark[] = results
    .filter((r) => r.outcome === 'locked')
    .map((r) => ({
      learnerId: r.learner_id,
      status: r.existing_status,
      markedBy: r.existing_by,
      markedAt: r.existing_at,
    }));

  // 409 ONLY when ownership is the whole story. If anything was written, or
  // anything was already correct, the batch did what was asked of it and a
  // failure status would be a lie — the caller would retry a write that already
  // landed.
  const disposition: MarkBatchSummary['disposition'] =
    written === 0 && skipped === 0 && locked.length > 0 ? 'all_locked' : 'ok';

  return {
    written,
    skipped,
    overrides,
    locked,
    dropped: Math.max(0, requested - results.length),
    disposition,
  };
}

/**
 * What to actually tell the person, given a 200-disposition summary.
 *
 * `kind` exists so the caller cannot render a partially-locked batch through a
 * plain success toast. A batch with locked rows is deliberately NOT 'success':
 * the whole failure mode this guards against is someone tapping Mark-all,
 * seeing a green tick, and believing every student was recorded.
 */
export function markBatchMessage(
  s: MarkBatchSummary,
  opts: { subject: string; status: 'present' | 'absent'; lockedOwnerName?: string },
): { kind: 'success' | 'warning'; text: string } {
  if (s.locked.length > 0) {
    const owner = opts.lockedOwnerName ?? 'another staff member';
    return {
      kind: 'warning',
      text:
        s.written === 0
          ? `No change — already marked by ${owner}.`
          : `Marked ${s.written}. ${s.locked.length} left unchanged — already marked by ${owner}.`,
    };
  }
  if (s.written === 0 && s.skipped > 0) {
    return { kind: 'success', text: `${opts.subject} was already marked ${opts.status}.` };
  }
  if (s.dropped > 0 && s.written === 0) {
    return { kind: 'warning', text: 'Nothing was marked — those students are not on this route.' };
  }
  return {
    kind: 'success',
    text: s.written === 1 ? `Marked ${opts.subject} ${opts.status}` : `Marked ${s.written} students ${opts.status}`,
  };
}
