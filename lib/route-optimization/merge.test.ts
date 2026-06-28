import { describe, it, expect } from 'vitest';
import { findMerges, type MergeRouteInput, type MergePassenger } from './merge';
import type { MatchStop } from './match';

const OPTS = { timeWindowMin: 15, proximityKm: 1.5, minOverlapStops: 1 };

const ms = (id: string, name: string, time: string | null = '07:30'): MatchStop => ({
  id, name, stopTime: time, lat: null, long: null,
});
const pax = (learnerId: string, stop: MatchStop | null): MergePassenger => ({
  learnerId, learnerName: learnerId, learnerRoll: null, stop,
});
const route = (o: Partial<MergeRouteInput> & { routeId: string }): MergeRouteInput => ({
  routeName: o.routeId, routeNumber: null, capacity: 55, occupancy: 0,
  classification: 'under_utilized', dailyCost: 2500, stops: [], passengers: [], ...o,
});

describe('findMerges', () => {
  it('folds an under-utilized route into a survivor that serves its stops', () => {
    const survivorStop = ms('s1', 'Gandhi Road', '07:30');
    const sourceStop = ms('a1', 'Gandhi Road', '07:32');
    const survivor = route({ routeId: 'S', classification: 'healthy', capacity: 55, occupancy: 30, stops: [survivorStop] });
    const source = route({ routeId: 'A', occupancy: 2, stops: [sourceStop], passengers: [pax('l1', sourceStop), pax('l2', sourceStop)] });

    const merges = findMerges([survivor, source], OPTS);
    expect(merges).toHaveLength(1);
    expect(merges[0].mergedRouteId).toBe('A');
    expect(merges[0].survivorRouteId).toBe('S');
    expect(merges[0].combinedPassengers).toBe(32);
    expect(merges[0].relocations).toHaveLength(2);
  });

  it('does not merge when the survivor lacks capacity', () => {
    const survivorStop = ms('s1', 'Gandhi Road', '07:30');
    const sourceStop = ms('a1', 'Gandhi Road', '07:30');
    const survivor = route({ routeId: 'S', classification: 'healthy', capacity: 31, occupancy: 30, stops: [survivorStop] });
    const source = route({ routeId: 'A', occupancy: 2, stops: [sourceStop], passengers: [pax('l1', sourceStop), pax('l2', sourceStop)] });
    expect(findMerges([survivor, source], OPTS)).toHaveLength(0);
  });

  it('does not merge when a passenger stop has no compatible survivor stop', () => {
    const survivor = route({ routeId: 'S', classification: 'healthy', capacity: 55, occupancy: 10, stops: [ms('s1', 'Gandhi Road', '07:30')] });
    const farStop = ms('a1', 'Far Town', '07:30');
    const source = route({ routeId: 'A', occupancy: 1, stops: [farStop], passengers: [pax('l1', farStop)] });
    expect(findMerges([survivor, source], OPTS)).toHaveLength(0);
  });

  it('folds multiple small routes into the same survivor while capacity holds', () => {
    // Same stop NAME on each route, but distinct stop ids (as in real data).
    const cStop = ms('c1', 'Town Center', '07:30');
    const aStop = ms('a1', 'Town Center', '07:30');
    const bStop = ms('b1', 'Town Center', '07:30');
    const survivor = route({ routeId: 'C', classification: 'healthy', capacity: 55, occupancy: 10, stops: [cStop] });
    const a = route({ routeId: 'A', occupancy: 2, stops: [aStop], passengers: [pax('a1l', aStop), pax('a2l', aStop)] });
    const b = route({ routeId: 'B', occupancy: 3, stops: [bStop], passengers: [pax('b1l', bStop), pax('b2l', bStop), pax('b3l', bStop)] });
    const merges = findMerges([survivor, a, b], OPTS);
    expect(merges).toHaveLength(2);
    expect(merges.every((m) => m.survivorRouteId === 'C')).toBe(true);
  });

  it('never chains (a survivor is not also merged away)', () => {
    // No healthy route; A(2) and B(3) each serve the same-named stop (distinct ids).
    const aStop = ms('a1', 'Town Center', '07:30');
    const bStop = ms('b1', 'Town Center', '07:30');
    const a = route({ routeId: 'A', occupancy: 2, capacity: 50, stops: [aStop], passengers: [pax('a1l', aStop), pax('a2l', aStop)] });
    const b = route({ routeId: 'B', occupancy: 3, capacity: 50, stops: [bStop], passengers: [pax('b1l', bStop), pax('b2l', bStop), pax('b3l', bStop)] });
    const merges = findMerges([a, b], OPTS);
    // Smallest-first: A folds into B; B then can't also be a source.
    expect(merges).toHaveLength(1);
    expect(merges[0].mergedRouteId).toBe('A');
    expect(merges[0].survivorRouteId).toBe('B');
  });
});
