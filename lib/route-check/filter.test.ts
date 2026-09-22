import { describe, it, expect } from 'vitest';
import { filterLearners, groupByStop } from './filter';
import type { CheckLearnerRow } from './types';

function row(overrides: Partial<CheckLearnerRow> = {}): CheckLearnerRow {
  return {
    learnerId: 'l1',
    name: 'Alpha',
    roll: '101',
    stopId: 's1',
    stopName: 'Stop A',
    stopTime: '07:30',
    status: 'unmarked',
    booked: true,
    feeState: 'paid',
    feeOwed: null,
    notOnRoute: false,
    otherBus: null,
    checked: false,
    checkOutcome: null,
    ...overrides,
  };
}

describe('filterLearners', () => {
  const rows: CheckLearnerRow[] = [
    row({ learnerId: 'l1', checked: true, checkOutcome: 'ok' }),
    row({ learnerId: 'l2', checked: false }),
    row({ learnerId: 'l3', feeState: 'unpaid', checked: false }),
    row({ learnerId: 'l4', booked: false, checked: false }),
    row({ learnerId: 'l5', notOnRoute: true, checked: false }),
  ];

  it('checked returns only checked rows', () => {
    expect(filterLearners(rows, 'checked').map((r) => r.learnerId)).toEqual(['l1']);
  });

  it('unchecked returns only unchecked rows', () => {
    expect(filterLearners(rows, 'unchecked').map((r) => r.learnerId)).toEqual(['l2', 'l3', 'l4', 'l5']);
  });

  it('unpaid returns only unpaid rows', () => {
    expect(filterLearners(rows, 'unpaid').map((r) => r.learnerId)).toEqual(['l3']);
  });

  it('without_booking returns only unbooked rows', () => {
    expect(filterLearners(rows, 'without_booking').map((r) => r.learnerId)).toEqual(['l4']);
  });

  it('not_on_route returns only flagged rows', () => {
    expect(filterLearners(rows, 'not_on_route').map((r) => r.learnerId)).toEqual(['l5']);
  });

  it('all returns every row', () => {
    expect(filterLearners(rows, 'all').map((r) => r.learnerId)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
  });
});

describe('groupByStop', () => {
  it('keeps roster order and merges adjacent same-stop rows', () => {
    const rows: CheckLearnerRow[] = [
      row({ learnerId: 'l1', stopName: 'Stop A', stopTime: '07:30' }),
      row({ learnerId: 'l2', stopName: 'Stop A', stopTime: '07:30' }),
      row({ learnerId: 'l3', stopName: 'Stop B', stopTime: '07:45' }),
      row({ learnerId: 'l4', stopName: 'Stop A', stopTime: '07:30' }),
    ];
    const groups = groupByStop(rows);
    // Non-adjacent same-stop rows are NOT merged: distinct groups keep roster order.
    expect(groups.map((g) => g.stopName)).toEqual(['Stop A', 'Stop B', 'Stop A']);
    expect(groups[0].rows.map((r) => r.learnerId)).toEqual(['l1', 'l2']);
    expect(groups[0].stopTime).toBe('07:30');
    expect(groups[1].rows.map((r) => r.learnerId)).toEqual(['l3']);
    expect(groups[2].rows.map((r) => r.learnerId)).toEqual(['l4']);
  });

  it('empty rows produce no groups', () => {
    expect(groupByStop([])).toEqual([]);
  });
});
