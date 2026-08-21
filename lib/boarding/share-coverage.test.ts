import { describe, it, expect } from 'vitest';
import { shareDuty, shareCovered, isExcused, delegatedTo, type AbsenceRow } from './share-coverage';

describe('shareDuty', () => {
  it('is the intersection of the share with the days bookings', () => {
    // The attendance roster lists every ALLOCATED learner, including
    // "Without ticket" ones the mark API refuses. Scoring an in-charge on
    // students they are not permitted to mark makes the rule unsatisfiable.
    expect(shareDuty({ shareLearnerIds: ['a', 'b', 'c'], bookedLearnerIds: ['b', 'c', 'z'] })).toEqual(['b', 'c']);
  });

  it('is empty when nobody in the share booked', () => {
    expect(shareDuty({ shareLearnerIds: ['a', 'b'], bookedLearnerIds: ['x'] })).toEqual([]);
  });

  it('preserves the share order', () => {
    expect(shareDuty({ shareLearnerIds: ['c', 'a', 'b'], bookedLearnerIds: ['a', 'b', 'c'] })).toEqual(['c', 'a', 'b']);
  });
});

describe('shareCovered', () => {
  it('is covered when every duty learner has a mark', () => {
    expect(shareCovered({ duty: ['a', 'b'], markedLearnerIds: ['a', 'b', 'c'] })).toEqual({
      required: 2, marked: 2, missing: [], covered: true,
    });
  });

  it('names the learners that are missing', () => {
    expect(shareCovered({ duty: ['a', 'b', 'c'], markedLearnerIds: ['b'] })).toEqual({
      required: 3, marked: 1, missing: ['a', 'c'], covered: false,
    });
  });

  it('treats an empty duty as covered', () => {
    // No duty means no possible failure -- the day is neither credit nor
    // blame, matching the existing no_travel_day outcome.
    expect(shareCovered({ duty: [], markedLearnerIds: [] })).toEqual({
      required: 0, marked: 0, missing: [], covered: true,
    });
  });
});

const absence = (over: Partial<AbsenceRow> = {}): AbsenceRow => ({
  assignment_id: 'A1',
  absence_date: '2026-08-21',
  covering_assignment_id: null,
  cover_status: 'pending',
  ...over,
});

describe('isExcused', () => {
  it('excuses the absentee on the declared date', () => {
    expect(isExcused('A1', '2026-08-21', [absence()])).toBe(true);
  });

  it('excuses them even when nobody accepted the cover', () => {
    // A declared absence excuses regardless of cover: the share simply goes
    // unmarked and shows on the coverage board.
    expect(isExcused('A1', '2026-08-21', [absence({ cover_status: 'declined' })])).toBe(true);
  });

  it('does not excuse a different date', () => {
    expect(isExcused('A1', '2026-08-22', [absence()])).toBe(false);
  });

  it('does not excuse a different assignment', () => {
    expect(isExcused('A2', '2026-08-21', [absence()])).toBe(false);
  });
});

describe('delegatedTo', () => {
  it('returns the shares this in-charge accepted cover for', () => {
    expect(delegatedTo('A2', '2026-08-21', [
      absence({ assignment_id: 'A1', covering_assignment_id: 'A2', cover_status: 'accepted' }),
    ])).toEqual(['A1']);
  });

  it('ignores a pending or declined cover', () => {
    expect(delegatedTo('A2', '2026-08-21', [
      absence({ assignment_id: 'A1', covering_assignment_id: 'A2', cover_status: 'pending' }),
      absence({ assignment_id: 'A3', covering_assignment_id: 'A2', cover_status: 'declined' }),
    ])).toEqual([]);
  });

  it('is scoped to the date', () => {
    expect(delegatedTo('A2', '2026-08-22', [
      absence({ assignment_id: 'A1', covering_assignment_id: 'A2', cover_status: 'accepted' }),
    ])).toEqual([]);
  });
});
