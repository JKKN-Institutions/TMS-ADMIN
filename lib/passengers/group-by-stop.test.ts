import { describe, it, expect } from 'vitest';
import { groupByStop, UNASSIGNED_STOP_KEY, UNASSIGNED_STOP_LABEL } from './group-by-stop';

// Shorthand for a roster row; only the grouping-relevant fields matter.
const person = (stop_id: string | null, stop_name: string | null, name: string) => ({
  stop_id,
  stop_name,
  pickup: null,
  evening: null,
  name,
});

const keys = <T extends { key: string }>(groups: T[]) => groups.map((g) => g.key);

describe('groupByStop', () => {
  it('groups a roster that is already contiguous by stop', () => {
    const groups = groupByStop([
      person('s1', 'ALPHA', 'A'),
      person('s1', 'ALPHA', 'B'),
      person('s2', 'BETA', 'C'),
    ]);
    expect(keys(groups)).toEqual(['s1', 's2']);
    expect(groups[0].people).toHaveLength(2);
    expect(groups[1].stop_name).toBe('BETA');
  });

  it('emits UNIQUE keys when the same stop is not contiguous', () => {
    // Regression: the roster API sorts by stop sequence_order and then by NAME.
    // Every person whose stop did not resolve shares the same sentinel
    // sequence, so they get interleaved by name and one stop_id appears in
    // several separate runs.
    const groups = groupByStop([
      person('s1', 'ALPHA', 'JAYASRI'),
      person('s2', 'BETA', 'KARTHIK'),
      person('s1', 'ALPHA', 'SARAVANAKUMAR'),
    ]);
    expect(new Set(keys(groups)).size).toBe(keys(groups).length);
    // and nobody is dropped
    expect(groups.flatMap((g) => g.people)).toHaveLength(3);
  });

  it('reproduces the real route 49 tail without duplicate keys', () => {
    // Actual ordering measured on route 49 (JALAKANDAPURAM): learners at
    // de-activated stops arrive name-sorted, so stop e45d437b appears twice.
    const groups = groupByStop([
      person('fd1eee2e', null, 'BHUVANESWARI K'),
      person('2fea97c8', null, 'DHINESH M'),
      person('fd1eee2e', null, 'GOWTHAM G'),
      person('e45d437b', null, 'JAYASRI N'),
      person('e45d437b', null, 'JEEVANANTHAM B'),
      person('736562f6', null, 'KARTHIK R V'),
      person('e45d437b', null, 'SARAVANAKUMAR K'),
    ]);
    expect(new Set(keys(groups)).size).toBe(keys(groups).length);
  });

  it('collapses every unresolvable stop into ONE unassigned bucket', () => {
    // A stop that is inactive/deleted comes back with an id but NO name, and
    // renders as "No stop assigned". Several such ids must not produce several
    // identical-looking sections.
    const groups = groupByStop([
      person('dead-1', null, 'A'),
      person(null, null, 'B'),
      person('dead-2', null, 'C'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(UNASSIGNED_STOP_KEY);
    expect(groups[0].stop_name).toBe(UNASSIGNED_STOP_LABEL);
    expect(groups[0].people).toHaveLength(3);
  });

  it('keeps first-appearance (boarding) order of the stops', () => {
    const groups = groupByStop([
      person('s3', 'GAMMA', 'A'),
      person('s1', 'ALPHA', 'B'),
      person('s3', 'GAMMA', 'C'),
    ]);
    expect(keys(groups)).toEqual(['s3', 's1']);
  });

  it('returns no groups for an empty roster', () => {
    expect(groupByStop([])).toEqual([]);
  });
});
