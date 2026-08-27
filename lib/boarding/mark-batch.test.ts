import { describe, it, expect } from 'vitest';
import {
  summarizeMarkBatch, markBatchMessage,
  type RpcMarkOutcome, type MarkOutcomeKind,
} from './mark-batch';

const OTHER = 'staff-b';

const out = (
  learner_id: string,
  outcome: MarkOutcomeKind,
  existing: { status?: 'present' | 'absent'; by?: string | null; at?: string | null } = {},
): RpcMarkOutcome => ({
  learner_id,
  outcome,
  existing_status: existing.status ?? null,
  existing_by: existing.by ?? null,
  existing_at: existing.at ?? null,
});

describe('summarizeMarkBatch — partial locks', () => {
  // The headline case: 19 write, 1 is held by a colleague. The 19 must stand.
  it('reports a mixed batch as a success that names what it could not do', () => {
    const results = [
      ...Array.from({ length: 19 }, (_, i) => out(`l${i}`, 'inserted')),
      out('locked-one', 'locked', { status: 'present', by: OTHER, at: 't' }),
    ];
    const s = summarizeMarkBatch(results, 20);
    expect(s.written).toBe(19);
    expect(s.locked).toHaveLength(1);
    expect(s.locked[0]).toEqual({
      learnerId: 'locked-one', status: 'present', markedBy: OTHER, markedAt: 't',
    });
    expect(s.disposition).toBe('ok'); // 200 — the 19 landed
  });

  // Every locked row must be reported, not merely the first. Truncating here is
  // how a caller concludes "one problem, dealt with" and moves on.
  it('reports EVERY locked row, not just the first', () => {
    const s = summarizeMarkBatch(
      [
        out('a', 'inserted'),
        out('b', 'locked', { status: 'absent', by: OTHER }),
        out('c', 'locked', { status: 'present', by: 'staff-c' }),
      ],
      3,
    );
    expect(s.locked.map((l) => l.learnerId)).toEqual(['b', 'c']);
  });

  it('is a 409 only when ownership is the WHOLE story', () => {
    expect(summarizeMarkBatch([out('a', 'locked', { by: OTHER })], 1).disposition).toBe('all_locked');
  });

  // The trap this guards: 19 rows already correct plus 1 locked row wrote
  // nothing, but the batch still did everything that was asked of it. A 409
  // would make the client retry writes that already landed.
  it('is NOT a 409 when nothing was written because nothing needed to be', () => {
    const s = summarizeMarkBatch(
      [
        ...Array.from({ length: 19 }, (_, i) => out(`l${i}`, 'noop_same_status')),
        out('locked-one', 'locked', { status: 'present', by: OTHER }),
      ],
      20,
    );
    expect(s.written).toBe(0);
    expect(s.skipped).toBe(19);
    expect(s.disposition).toBe('ok');
  });

  it('counts overrides as written, and separately', () => {
    const s = summarizeMarkBatch(
      [out('a', 'overridden', { status: 'absent', by: OTHER }), out('b', 'updated_own'), out('c', 'inserted')],
      3,
    );
    expect(s.written).toBe(3);
    expect(s.overrides).toBe(1);
    expect(s.locked).toHaveLength(0);
  });

  // Marks filtered out before the RPC (not on this route) never come back as
  // outcomes at all. Left uncounted, a 5-mark request reporting "2 written"
  // silently loses three students.
  it('counts marks that never reached the database', () => {
    const s = summarizeMarkBatch([out('a', 'inserted'), out('b', 'inserted')], 5);
    expect(s.dropped).toBe(3);
    expect(s.written).toBe(2);
  });

  it('never reports negative dropped when more results arrive than requested', () => {
    expect(summarizeMarkBatch([out('a', 'inserted')], 0).dropped).toBe(0);
  });

  it('handles an empty batch without inventing a failure', () => {
    const s = summarizeMarkBatch([], 0);
    expect(s).toMatchObject({ written: 0, skipped: 0, locked: [], dropped: 0, disposition: 'ok' });
  });
});

describe('markBatchMessage — the UI must not overstate', () => {
  const subject = 'Priya R';

  // The core requirement: a partially locked batch is never a plain success.
  it('downgrades a partially locked batch to a warning that states the shortfall', () => {
    const s = summarizeMarkBatch(
      [out('a', 'inserted'), out('b', 'locked', { status: 'present', by: OTHER })],
      2,
    );
    const msg = markBatchMessage(s, { subject, status: 'present', lockedOwnerName: 'Saranya G' });
    expect(msg.kind).toBe('warning');
    expect(msg.text).toContain('1 left unchanged');
    expect(msg.text).toContain('Saranya G');
    // The count of what DID land must still be visible.
    expect(msg.text).toContain('Marked 1');
  });

  it('never claims a count it did not write', () => {
    const s = summarizeMarkBatch(
      [out('a', 'locked', { by: OTHER }), out('b', 'locked', { by: OTHER })],
      2,
    );
    const msg = markBatchMessage(s, { subject, status: 'present' });
    expect(msg.kind).toBe('warning');
    expect(msg.text).toBe('No change — already marked by another staff member.');
    expect(msg.text).not.toMatch(/Marked \d/);
  });

  it('reports an already-correct row as a quiet success, not a failure', () => {
    const s = summarizeMarkBatch([out('a', 'noop_same_status')], 1);
    const msg = markBatchMessage(s, { subject, status: 'present' });
    expect(msg.kind).toBe('success');
    expect(msg.text).toBe('Priya R was already marked present.');
  });

  it('names the single-row success in the singular', () => {
    const msg = markBatchMessage(summarizeMarkBatch([out('a', 'inserted')], 1), {
      subject, status: 'absent',
    });
    expect(msg).toEqual({ kind: 'success', text: 'Marked Priya R absent' });
  });

  it('warns when everything was dropped as off-route', () => {
    const msg = markBatchMessage(summarizeMarkBatch([], 3), { subject, status: 'present' });
    expect(msg.kind).toBe('warning');
    expect(msg.text).toContain('not on this route');
  });

  // Property: across every shape a batch can take, a summary carrying locked
  // rows can NEVER produce a 'success'. This is the invariant, independent of
  // the specific wording above.
  it('never yields kind:success while any row is locked', () => {
    for (const written of [0, 1, 5])
      for (const skipped of [0, 3])
        for (const lockedCount of [1, 2]) {
          const results = [
            ...Array.from({ length: written }, (_, i) => out(`w${i}`, 'inserted')),
            ...Array.from({ length: skipped }, (_, i) => out(`s${i}`, 'noop_same_status')),
            ...Array.from({ length: lockedCount }, (_, i) => out(`k${i}`, 'locked', { by: OTHER })),
          ];
          const s = summarizeMarkBatch(results, results.length);
          expect(markBatchMessage(s, { subject, status: 'present' }).kind).toBe('warning');
        }
  });
});
