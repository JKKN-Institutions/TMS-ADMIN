/**
 * Parity between the TypeScript rule and the SQL rule.
 *
 * The same question — may this actor write this mark? — is now answered in two
 * places:
 *   • lib/boarding/attendance-ownership.ts `decideMark`, which drives the
 *     roster's can_edit hint in the browser;
 *   • the `on conflict do update ... WHERE` in
 *     supabase/migrations/20260827090000_tms_mark_attendance_atomic.sql, which
 *     is what actually enforces the write.
 *
 * If those two ever disagree, the UI offers a button the server refuses (or
 * worse, hides one it would have allowed). No unit test can span TypeScript and
 * Postgres, so this file does the next best thing: it TRANSCRIBES the SQL
 * predicate into TypeScript and asserts the transcription agrees with
 * decideMark across the entire cross-product of inputs.
 *
 * WHAT THIS DOES AND DOES NOT PROVE.
 *   ✓ Proves: the two RULES are the same rule, on every combination of inputs.
 *   ✗ Does NOT prove: that `sqlGate` below is a faithful transcription of the
 *     migration, or that Postgres behaves as transcribed. That needs the
 *     migration applied and the concurrency proof run (task A3).
 *
 * So this is a CHANGE DETECTOR, not a correctness proof. Edit the migration's
 * WHERE clause without editing `sqlGate`, and the drift is invisible; edit
 * either rule's semantics, and this file fails loudly. Keep them adjacent in
 * review.
 */
import { describe, it, expect } from 'vitest';
import { decideMark, type MarkStatus } from './attendance-ownership';

const ME = 'actor-me';
const OTHER = 'actor-other';

/**
 * Transcription of the migration's gate. Mirrors, line for line:
 *
 *   where t.status is distinct from excluded.status
 *     and (
 *       t.scanned_by is null
 *       or t.scanned_by = p_actor
 *       or p_allow_override
 *       or coalesce((m->>'allow_override')::boolean, false)
 *     )
 *
 * Returns whether a row would be written. An INSERT with no conflicting row
 * always writes, which is the `existing === null` case.
 */
function sqlGate(input: {
  existingStatus: MarkStatus | null;
  existingScannedBy: string | null;
  requestedStatus: MarkStatus;
  actor: string;
  pAllowOverride: boolean;
  markAllowOverride: boolean;
}): boolean {
  // No conflicting row -> plain INSERT, always writes.
  if (input.existingStatus === null) return true;
  // `t.status is distinct from excluded.status`
  if (input.existingStatus === input.requestedStatus) return false;
  return (
    input.existingScannedBy === null ||
    input.existingScannedBy === input.actor ||
    input.pAllowOverride ||
    input.markAllowOverride
  );
}

/**
 * How the two call sites derive the SQL flags from the same facts decideMark
 * takes. This is the mapping under test as much as the rule itself: a fact that
 * decideMark honours but neither call site forwards is exactly the drift that
 * shipped undetected before this file existed.
 */
function flagsForCallSite(f: {
  isOverrideHolder: boolean;
  isSuperAdmin: boolean;
  viaScan: boolean;
  isLearnerOwner: boolean;
}): { pAllowOverride: boolean; markAllowOverride: boolean } {
  return {
    // Caller-level: app/api/boarding/attendance/route.ts passes
    // `isOverrideHolder || auth.isSuperAdmin`; the scanner passes a constant
    // true, which is the viaScan entitlement.
    pAllowOverride: f.isOverrideHolder || f.isSuperAdmin || f.viaScan,
    // Per-learner: owning the learner outranks a coverer who marked them.
    markAllowOverride: f.isLearnerOwner,
  };
}

const STATUSES: (MarkStatus | null)[] = [null, 'present', 'absent'];
const REQUESTED: MarkStatus[] = ['present', 'absent'];
const MARKERS: (string | null)[] = [null, ME, OTHER];
const BOOLS = [false, true];

describe('decideMark ↔ SQL gate parity', () => {
  it('agrees on every combination of inputs', () => {
    const disagreements: string[] = [];
    let checked = 0;

    for (const existingStatus of STATUSES)
      for (const existingScannedBy of MARKERS)
        for (const requestedStatus of REQUESTED)
          for (const isOverrideHolder of BOOLS)
            for (const isSuperAdmin of BOOLS)
              for (const viaScan of BOOLS)
                for (const isLearnerOwner of BOOLS) {
                  // An absent row cannot carry a marker; skip the impossible half.
                  if (existingStatus === null && existingScannedBy !== null) continue;
                  checked += 1;

                  const decision = decideMark({
                    existing: existingStatus
                      ? { status: existingStatus, scannedBy: existingScannedBy }
                      : null,
                    requestedStatus,
                    actorId: ME,
                    isOverrideHolder,
                    isSuperAdmin,
                    viaScan,
                    isLearnerOwner,
                  });
                  const tsWrites = decision.action === 'write' || decision.action === 'override';

                  const { pAllowOverride, markAllowOverride } = flagsForCallSite({
                    isOverrideHolder, isSuperAdmin, viaScan, isLearnerOwner,
                  });
                  const sqlWrites = sqlGate({
                    existingStatus, existingScannedBy, requestedStatus,
                    actor: ME, pAllowOverride, markAllowOverride,
                  });

                  if (tsWrites !== sqlWrites) {
                    disagreements.push(
                      `existing=${existingStatus}/${existingScannedBy} want=${requestedStatus} ` +
                        `override=${isOverrideHolder} super=${isSuperAdmin} scan=${viaScan} owner=${isLearnerOwner} ` +
                        `→ ts:${tsWrites} sql:${sqlWrites}`,
                    );
                  }
                }

    expect(disagreements).toEqual([]);
    // Guards against a refactor that silently narrows the sweep to nothing.
    expect(checked).toBeGreaterThan(200);
  });

  // The no-op has to be distinguishable from a refusal on BOTH sides, because
  // the route turns one into a quiet success and the other into a 409.
  it('agrees that a same-status write is a no-op, never a refusal', () => {
    for (const status of REQUESTED)
      for (const scannedBy of MARKERS) {
        const decision = decideMark({
          existing: { status, scannedBy },
          requestedStatus: status,
          actorId: ME,
          isOverrideHolder: true,
          isSuperAdmin: true,
          viaScan: true,
          isLearnerOwner: true,
        });
        expect(decision).toEqual({ action: 'noop', reason: 'already_that_status' });
        // Even with every entitlement set, SQL still declines to write.
        expect(
          sqlGate({
            existingStatus: status, existingScannedBy: scannedBy, requestedStatus: status,
            actor: ME, pAllowOverride: true, markAllowOverride: true,
          }),
        ).toBe(false);
      }
  });

  // The regression this file was written to catch: isLearnerOwner reached
  // decideMark (so the roster enabled the button) but no call site forwarded it
  // (so the write was refused). It is a per-LEARNER fact and p_allow_override is
  // a per-CALL flag, which is why it needs its own carrier in p_marks.
  it("forwards the owner's entitlement to SQL, not just to the UI", () => {
    const facts = {
      existing: { status: 'absent' as MarkStatus, scannedBy: OTHER },
      requestedStatus: 'present' as MarkStatus,
      actorId: ME,
      isOverrideHolder: false,
      isSuperAdmin: false,
      viaScan: false,
      isLearnerOwner: true,
    };
    expect(decideMark(facts).action).toBe('override');

    const { pAllowOverride, markAllowOverride } = flagsForCallSite(facts);
    expect(pAllowOverride).toBe(false); // nothing caller-level applies here
    expect(markAllowOverride).toBe(true); // so it MUST ride on the mark
    expect(
      sqlGate({
        existingStatus: 'absent', existingScannedBy: OTHER, requestedStatus: 'present',
        actor: ME, pAllowOverride, markAllowOverride,
      }),
    ).toBe(true);
  });

  it('refuses an unentitled writer on both sides', () => {
    const facts = {
      existing: { status: 'absent' as MarkStatus, scannedBy: OTHER },
      requestedStatus: 'present' as MarkStatus,
      actorId: ME,
      isOverrideHolder: false,
      isSuperAdmin: false,
      viaScan: false,
      isLearnerOwner: false,
    };
    expect(decideMark(facts)).toEqual({ action: 'deny', reason: 'locked' });
    const { pAllowOverride, markAllowOverride } = flagsForCallSite(facts);
    expect(
      sqlGate({
        existingStatus: 'absent', existingScannedBy: OTHER, requestedStatus: 'present',
        actor: ME, pAllowOverride, markAllowOverride,
      }),
    ).toBe(false);
  });

  it('treats an orphaned row as writable on both sides', () => {
    const facts = {
      existing: { status: 'absent' as MarkStatus, scannedBy: null },
      requestedStatus: 'present' as MarkStatus,
      actorId: ME,
      isOverrideHolder: false,
      isSuperAdmin: false,
      viaScan: false,
      isLearnerOwner: false,
    };
    expect(decideMark(facts).action).toBe('write');
    const { pAllowOverride, markAllowOverride } = flagsForCallSite(facts);
    expect(
      sqlGate({
        existingStatus: 'absent', existingScannedBy: null, requestedStatus: 'present',
        actor: ME, pAllowOverride, markAllowOverride,
      }),
    ).toBe(true);
  });
});
