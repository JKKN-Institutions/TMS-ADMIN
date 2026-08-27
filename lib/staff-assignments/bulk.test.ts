import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  resolveAssignmentEmail,
  isBulkCandidate,
  isAlreadyAssigned,
  groupCandidatesByRoute,
  summarizeBulkResults,
  chunkIds,
  type Candidate,
  type CandidateInput,
  type BulkResult,
} from './bulk';

const cand = (over: Partial<CandidateInput> = {}): CandidateInput => ({
  staffId: 's1',
  name: 'Kamali',
  staffEmail: 'kamali@jkkn.ac.in',
  profileEmail: 'kamali@jkkn.ac.in',
  routeId: 'r29',
  routeActive: true,
  ...over,
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Kamali@JKKN.ac.in ')).toBe('kamali@jkkn.ac.in');
  });

  it('returns null for null, undefined and blank', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });
});

describe('resolveAssignmentEmail', () => {
  // The eligibility RPC counts assignments by profiles.email. Writing
  // staff.email for a divergent staffer lets them self-assign a second time
  // past the unique index -> two active rows for one human.
  it('prefers the profile email over the staff email', () => {
    expect(resolveAssignmentEmail('personal@gmail.com', 'k@jkkn.ac.in')).toBe('k@jkkn.ac.in');
  });

  it('falls back to the staff email when there is no profile email', () => {
    expect(resolveAssignmentEmail('k@jkkn.ac.in', null)).toBe('k@jkkn.ac.in');
  });

  it('treats a blank profile email as absent', () => {
    expect(resolveAssignmentEmail('k@jkkn.ac.in', '  ')).toBe('k@jkkn.ac.in');
  });

  it('returns null when neither address exists', () => {
    expect(resolveAssignmentEmail(null, null)).toBeNull();
  });

  it('lowercases whichever address it picks', () => {
    expect(resolveAssignmentEmail(null, 'K@JKKN.ac.in')).toBe('k@jkkn.ac.in');
  });
});

describe('isAlreadyAssigned', () => {
  it('matches on the staff address alone', () => {
    expect(isAlreadyAssigned('kamali@jkkn.ac.in', null, new Set(['kamali@jkkn.ac.in']))).toBe(true);
  });

  it('matches on the profile address alone', () => {
    expect(isAlreadyAssigned('personal@gmail.com', 'k@jkkn.ac.in', new Set(['k@jkkn.ac.in']))).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isAlreadyAssigned('Kamali@JKKN.ac.in', null, new Set(['kamali@jkkn.ac.in']))).toBe(true);
  });

  it('returns false when neither address is present', () => {
    expect(isAlreadyAssigned(null, null, new Set(['kamali@jkkn.ac.in']))).toBe(false);
  });

  it('returns false when the set is empty', () => {
    expect(isAlreadyAssigned('kamali@jkkn.ac.in', 'k@jkkn.ac.in', new Set())).toBe(false);
  });

  it('returns false when neither address is in the set', () => {
    expect(isAlreadyAssigned('kamali@jkkn.ac.in', 'k@jkkn.ac.in', new Set(['other@jkkn.ac.in']))).toBe(false);
  });
});

describe('isBulkCandidate', () => {
  it('accepts an unassigned staffer with an active master route', () => {
    expect(isBulkCandidate(cand(), new Set())).toBe(true);
  });

  it('rejects someone already assigned under their STAFF email', () => {
    expect(isBulkCandidate(cand(), new Set(['kamali@jkkn.ac.in']))).toBe(false);
  });

  // The divergent case: assigned under the profile address only. Matching on
  // staff.email alone would offer them as a candidate and duplicate them.
  it('rejects someone already assigned under their PROFILE email only', () => {
    const c = cand({ staffEmail: 'personal@gmail.com', profileEmail: 'k@jkkn.ac.in' });
    expect(isBulkCandidate(c, new Set(['k@jkkn.ac.in']))).toBe(false);
  });

  it('rejects someone already assigned under their STAFF email only', () => {
    const c = cand({ staffEmail: 'personal@gmail.com', profileEmail: 'k@jkkn.ac.in' });
    expect(isBulkCandidate(c, new Set(['personal@gmail.com']))).toBe(false);
  });

  it('matches the assigned set case-insensitively', () => {
    const c = cand({ staffEmail: 'Kamali@JKKN.ac.in', profileEmail: null });
    expect(isBulkCandidate(c, new Set(['kamali@jkkn.ac.in']))).toBe(false);
  });

  it('rejects a staffer with no master route', () => {
    expect(isBulkCandidate(cand({ routeId: null }), new Set())).toBe(false);
  });

  it('rejects a staffer whose master route is inactive', () => {
    expect(isBulkCandidate(cand({ routeActive: false }), new Set())).toBe(false);
  });

  it('rejects a staffer with no usable email at all', () => {
    expect(isBulkCandidate(cand({ staffEmail: null, profileEmail: null }), new Set())).toBe(false);
  });
});

describe('groupCandidatesByRoute', () => {
  const c = (staffId: string, routeId: string, routeNumber: string): Candidate => ({
    staffId,
    name: staffId,
    email: `${staffId}@jkkn.ac.in`,
    staffCode: null,
    routeId,
    routeNumber,
    routeName: `Route ${routeNumber}`,
  });

  it('groups staff under their route', () => {
    const g = groupCandidatesByRoute([c('a', 'r1', '29'), c('b', 'r1', '29'), c('d', 'r2', '07')]);
    expect(g).toHaveLength(2);
    expect(g[0].routeId).toBe('r1');
    expect(g[0].staff.map((s) => s.staffId)).toEqual(['a', 'b']);
  });

  it('sorts groups by staff count descending', () => {
    const g = groupCandidatesByRoute([c('a', 'r2', '07'), c('b', 'r1', '29'), c('d', 'r1', '29')]);
    expect(g.map((x) => x.routeId)).toEqual(['r1', 'r2']);
  });

  it('breaks ties on route number ascending', () => {
    const g = groupCandidatesByRoute([c('a', 'r2', '29'), c('b', 'r1', '07')]);
    expect(g.map((x) => x.routeNumber)).toEqual(['07', '29']);
  });

  it('returns an empty array for no candidates', () => {
    expect(groupCandidatesByRoute([])).toEqual([]);
  });
});

describe('summarizeBulkResults', () => {
  const r = (outcome: BulkResult['outcome']): BulkResult => ({
    staffId: 'x', name: 'X', email: 'x@y', routeId: 'r', routeLabel: '29', outcome,
  });

  it('counts assigned, skipped and errors separately', () => {
    const s = summarizeBulkResults([
      r('assigned'), r('assigned'),
      r('skipped_already_assigned'), r('skipped_no_route'),
      r('error'),
    ]);
    expect(s).toEqual({ assigned: 2, skipped: 2, errors: 1 });
  });

  it('counts every skipped_* variant as skipped', () => {
    const s = summarizeBulkResults([
      r('skipped_already_assigned'), r('skipped_not_eligible'),
      r('skipped_no_email'), r('skipped_no_route'), r('skipped_route_inactive'),
    ]);
    expect(s).toEqual({ assigned: 0, skipped: 5, errors: 0 });
  });

  it('returns zeroes for an empty batch', () => {
    expect(summarizeBulkResults([])).toEqual({ assigned: 0, skipped: 0, errors: 0 });
  });
});

describe('chunkIds', () => {
  it('returns a single batch when under the size', () => {
    expect(chunkIds(['a', 'b'], 100)).toEqual([['a', 'b']]);
  });

  it('splits evenly at the boundary', () => {
    const ids = Array.from({ length: 4 }, (_, i) => `id${i}`);
    expect(chunkIds(ids, 2)).toEqual([['id0', 'id1'], ['id2', 'id3']]);
  });

  it('puts the remainder in a smaller final batch', () => {
    const ids = Array.from({ length: 5 }, (_, i) => `id${i}`);
    expect(chunkIds(ids, 2)).toEqual([['id0', 'id1'], ['id2', 'id3'], ['id4']]);
  });

  it('returns an empty array for no ids', () => {
    expect(chunkIds([], 100)).toEqual([]);
  });

  it('throws for a non-positive size', () => {
    expect(() => chunkIds(['a'], 0)).toThrow();
  });
});
