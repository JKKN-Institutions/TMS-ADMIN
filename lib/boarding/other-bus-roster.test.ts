import { describe, it, expect } from 'vitest';
import { mergeOtherBuses, type OtherBusFacts } from './other-bus-roster';
import type { RosterRider } from '@/lib/booking/roster';

const rider = (id: string, booked: boolean): RosterRider => ({
  learner_id: id, name: id.toUpperCase(), roll: null, stop_id: `stop-${id}`, booked,
});

const facts = (over: Partial<OtherBusFacts>): OtherBusFacts => ({
  bookedElsewhere: new Map(),
  boardedElsewhere: new Map(),
  strangers: [],
  routeNumbers: new Map([['r24', '24'], ['r06', '06']]),
  ...over,
});

describe('mergeOtherBuses', () => {
  it('leaves an ordinary list untouched', () => {
    const riders = [rider('a', true), rider('b', false)];
    expect(mergeOtherBuses(riders, facts({}))).toEqual(riders);
  });

  it('tags an unbooked rider who booked another bus', () => {
    const out = mergeOtherBuses([rider('sri', false)], facts({ bookedElsewhere: new Map([['sri', 'r24']]) }));
    expect(out[0].other_bus).toEqual({ kind: 'booked', routeId: 'r24', routeNumber: '24' });
    expect(out[0].booked).toBe(false);
  });

  it('never tags a rider booked on this bus as booked elsewhere', () => {
    const out = mergeOtherBuses([rider('a', true)], facts({ bookedElsewhere: new Map([['a', 'r24']]) }));
    expect(out[0].other_bus).toBeUndefined();
  });

  it('"boarded another bus" wins over "booked another bus"', () => {
    const out = mergeOtherBuses(
      [rider('sri', false)],
      facts({ bookedElsewhere: new Map([['sri', 'r24']]), boardedElsewhere: new Map([['sri', 'r06']]) }),
    );
    expect(out[0].other_bus).toEqual({ kind: 'boarded', routeId: 'r06', routeNumber: '06' });
  });

  it('adds a learner from another bus who was recorded here', () => {
    const out = mergeOtherBuses([rider('a', true)], facts({
      strangers: [{ learner_id: 'ajay', name: 'AJAY P', roll: 'R1', stop_id: null, allocatedRouteId: 'r24' }],
    }));
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      learner_id: 'ajay', name: 'AJAY P', roll: 'R1', stop_id: null, booked: false,
      other_bus: { kind: 'from', routeId: 'r24', routeNumber: '24' },
    });
  });

  it('a stranger who booked a third bus is shown with that booking', () => {
    const out = mergeOtherBuses([], facts({
      bookedElsewhere: new Map([['ajay', 'r06']]),
      strangers: [{ learner_id: 'ajay', name: 'AJAY P', roll: null, stop_id: null, allocatedRouteId: 'r24' }],
    }));
    expect(out[0].other_bus).toEqual({ kind: 'booked', routeId: 'r06', routeNumber: '06' });
  });

  it('does not add a stranger twice or duplicate a listed rider', () => {
    const out = mergeOtherBuses([rider('a', true)], facts({
      strangers: [{ learner_id: 'a', name: 'A', roll: null, stop_id: null, allocatedRouteId: 'r24' }],
    }));
    expect(out).toHaveLength(1);
  });

  it('an unknown route number is null, not a crash', () => {
    const out = mergeOtherBuses([rider('x', false)], facts({ bookedElsewhere: new Map([['x', 'r99']]) }));
    expect(out[0].other_bus).toEqual({ kind: 'booked', routeId: 'r99', routeNumber: null });
  });
});
