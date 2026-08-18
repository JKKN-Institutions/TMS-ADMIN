import { describe, expect, it } from 'vitest';
import {
  removalNoticeIdempotencyKey,
  splitByAlreadySent,
  type DeliverableNotice,
} from './incharge-removal-delivery';

const notice = (assignmentId: string, profileId: string | null = 'p-1'): DeliverableNotice => ({
  assignmentId,
  profileId,
  staffEmail: `${assignmentId}@jkkn.ac.in`,
});

describe('removalNoticeIdempotencyKey', () => {
  it('derives the key from the assignment, so one removal can notify only once', () => {
    expect(removalNoticeIdempotencyKey('a-1')).toBe('incharge-removal-bill:a-1');
  });

  // The route inlined this template before; a preview computing the key one way
  // and the sender another would report "0 already sent" and then send nothing.
  it('is stable across calls so preview and send agree on what was delivered', () => {
    expect(removalNoticeIdempotencyKey('a-1')).toBe(removalNoticeIdempotencyKey('a-1'));
  });
});

describe('splitByAlreadySent', () => {
  it('routes a notice whose key is absent to pending', () => {
    const out = splitByAlreadySent([notice('a-1')], new Set());
    expect(out.pending.map((n) => n.assignmentId)).toEqual(['a-1']);
    expect(out.alreadySent).toHaveLength(0);
  });

  it('routes a notice whose key is present to alreadySent', () => {
    const out = splitByAlreadySent([notice('a-1')], new Set(['incharge-removal-bill:a-1']));
    expect(out.pending).toHaveLength(0);
    expect(out.alreadySent.map((n) => n.assignmentId)).toEqual(['a-1']);
  });

  // The whole point of the preview: after a partial send, the operator must see
  // how many people are actually about to be messaged, not the original 35.
  it('splits a mixed batch rather than reporting all-or-nothing', () => {
    const out = splitByAlreadySent(
      [notice('a-1'), notice('a-2'), notice('a-3')],
      new Set(['incharge-removal-bill:a-2']),
    );
    expect(out.pending.map((n) => n.assignmentId)).toEqual(['a-1', 'a-3']);
    expect(out.alreadySent.map((n) => n.assignmentId)).toEqual(['a-2']);
  });

  // Unreachable is counted separately from pending because it needs a different
  // fix (create the login) and must never be reported as "will be notified".
  it('separates notices with no profile, which cannot be delivered at all', () => {
    const out = splitByAlreadySent([notice('a-1', null), notice('a-2')], new Set());
    expect(out.pending.map((n) => n.assignmentId)).toEqual(['a-2']);
    expect(out.unreachable.map((n) => n.assignmentId)).toEqual(['a-1']);
  });

  it('classifies an unreachable notice that was somehow already sent as sent, not pending', () => {
    const out = splitByAlreadySent(
      [notice('a-1', null)],
      new Set(['incharge-removal-bill:a-1']),
    );
    expect(out.alreadySent.map((n) => n.assignmentId)).toEqual(['a-1']);
    expect(out.unreachable).toHaveLength(0);
    expect(out.pending).toHaveLength(0);
  });

  it('holds an empty batch without throwing, so a cleared board renders normally', () => {
    const out = splitByAlreadySent([], new Set());
    expect(out).toEqual({ pending: [], alreadySent: [], unreachable: [] });
  });
});
