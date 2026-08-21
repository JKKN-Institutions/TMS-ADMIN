import { describe, it, expect } from 'vitest';
import { splitRouteShare, type ShareStudent, type ShareInCharge } from './share-split';

/** n students spread evenly across `stops` stops, roll numbers R001.. */
function students(n: number, stops: number): ShareStudent[] {
  return Array.from({ length: n }, (_, i) => ({
    learner_id: `L${String(i + 1).padStart(3, '0')}`,
    stop_sequence: (i % stops) + 1,
    roll: `R${String(i + 1).padStart(3, '0')}`,
  }));
}

function inCharges(n: number, stopSequences: number[]): ShareInCharge[] {
  return Array.from({ length: n }, (_, i) => ({
    assignment_id: `A${String(i + 1).padStart(2, '0')}`,
    staff_email: `staff${String(i + 1).padStart(2, '0')}@jkkn.ac.in`,
    stop_sequence: stopSequences[i % stopSequences.length],
  }));
}

describe('splitRouteShare', () => {
  it('gives every in-charge a non-empty share on route 29s shape', () => {
    // Route 29 measured 2026-08-21: 14 in-charges sharing only 4 distinct
    // boarding stops, 48 students over 21 stops. A stop-based split would
    // leave 10 of the 14 owning nothing; this is the case that decided the
    // algorithm.
    const shares = splitRouteShare({
      students: students(48, 21),
      inCharges: inCharges(14, [3, 3, 3, 7, 7, 12, 12, 12, 18, 18, 18, 18, 21, 21]),
    });
    expect(shares).toHaveLength(14);
    for (const s of shares) expect(s.learner_ids.length).toBeGreaterThan(0);
  });

  it('balances counts to within one student', () => {
    const shares = splitRouteShare({ students: students(48, 21), inCharges: inCharges(14, [1]) });
    const sizes = shares.map((s) => s.learner_ids.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('assigns every student exactly once', () => {
    const shares = splitRouteShare({ students: students(48, 21), inCharges: inCharges(14, [1]) });
    const all = shares.flatMap((s) => s.learner_ids);
    expect(all).toHaveLength(48);
    expect(new Set(all).size).toBe(48);
  });

  it('gives each in-charge a contiguous band in stop order', () => {
    // 12 students at stops 1..12, 3 in-charges -> stops 1-4, 5-8, 9-12.
    const shares = splitRouteShare({ students: students(12, 12), inCharges: inCharges(3, [1, 5, 9]) });
    expect(shares[0].learner_ids).toEqual(['L001', 'L002', 'L003', 'L004']);
    expect(shares[1].learner_ids).toEqual(['L005', 'L006', 'L007', 'L008']);
    expect(shares[2].learner_ids).toEqual(['L009', 'L010', 'L011', 'L012']);
  });

  it('handles fewer stops than in-charges', () => {
    const shares = splitRouteShare({ students: students(20, 2), inCharges: inCharges(5, [1, 1, 2, 2, 2]) });
    expect(shares).toHaveLength(5);
    expect(shares.every((s) => s.learner_ids.length === 4)).toBe(true);
  });

  it('leaves trailing shares empty when there are fewer students than in-charges', () => {
    const shares = splitRouteShare({ students: students(2, 2), inCharges: inCharges(5, [1]) });
    expect(shares).toHaveLength(5);
    expect(shares.filter((s) => s.learner_ids.length > 0)).toHaveLength(2);
  });

  it('returns no shares when the route has no in-charges', () => {
    // Routes 37, 13 and 10 carry 150 students between them and have zero
    // in-charges. Nobody owns them and nobody is billed.
    expect(splitRouteShare({ students: students(74, 12), inCharges: [] })).toEqual([]);
  });

  it('gives stop-less students to the least-loaded in-charge', () => {
    const withNoStop: ShareStudent[] = [
      ...students(4, 2),
      { learner_id: 'LX', stop_sequence: null, roll: 'R999' },
    ];
    // 4 placed students over 3 in-charges -> sizes 2,1,1; LX must go to the
    // first in-charge holding only 1, i.e. A02.
    const shares = splitRouteShare({ students: withNoStop, inCharges: inCharges(3, [1, 2, 3]) });
    const owner = shares.find((s) => s.learner_ids.includes('LX'));
    expect(owner?.assignment_id).toBe('A02');
  });

  it('honours pinned learners and excludes them from the balanced pool', () => {
    const shares = splitRouteShare({
      students: students(12, 12),
      inCharges: inCharges(3, [1, 5, 9]),
      pinned: [{ learner_id: 'L001', assignment_id: 'A03' }],
    });
    expect(shares.find((s) => s.assignment_id === 'A03')?.learner_ids).toContain('L001');
    expect(shares.find((s) => s.assignment_id === 'A01')?.learner_ids).not.toContain('L001');
    expect(shares.flatMap((s) => s.learner_ids).filter((id) => id === 'L001')).toHaveLength(1);
  });

  it('ignores a pin that names an in-charge who is no longer on the route', () => {
    const shares = splitRouteShare({
      students: students(6, 6),
      inCharges: inCharges(2, [1, 4]),
      pinned: [{ learner_id: 'L001', assignment_id: 'A99' }],
    });
    expect(shares.flatMap((s) => s.learner_ids)).toContain('L001');
  });

  it('is deterministic regardless of input order', () => {
    const s = students(30, 10);
    const ic = inCharges(4, [2, 2, 6, 9]);
    const a = splitRouteShare({ students: s, inCharges: ic });
    const b = splitRouteShare({ students: [...s].reverse(), inCharges: [...ic].reverse() });
    expect(b).toEqual(a);
  });
});
