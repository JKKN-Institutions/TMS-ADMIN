import { describe, it, expect } from 'vitest';
import { decideBus, type BusInput } from './wrong-bus';

const B49 = 'bus-49';
const B24 = 'bus-24';
const B06 = 'bus-06';

const base = (over: Partial<BusInput>): BusInput => ({
  staffRouteIds: [B49],
  allocatedRouteId: B49,
  allocatedStopId: 'stop-49',
  booking: null,
  ...over,
});

function ok(input: BusInput) {
  const r = decideBus(input);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.decision;
}

describe('decideBus', () => {
  it('allocated here and booked here: a normal boarding', () => {
    const d = ok(base({ booking: { routeId: B49, stopId: 'booked-stop' } }));
    expect(d).toEqual({ busRouteId: B49, wrongBus: null, walkUp: false, bookedRouteId: null, stopId: 'booked-stop' });
  });

  it('allocated here, no booking: travelled without booking, not a wrong bus', () => {
    const d = ok(base({}));
    expect(d).toEqual({ busRouteId: B49, wrongBus: null, walkUp: true, bookedRouteId: null, stopId: 'stop-49' });
  });

  it('allocated here, booked on another bus: wrong bus, recorded here, not a walk-up', () => {
    const d = ok(base({ booking: { routeId: B24, stopId: 'stop-24' } }));
    expect(d.busRouteId).toBe(B49);
    expect(d.wrongBus).toEqual({ kind: 'booked_other_bus', routeId: B24 });
    expect(d.walkUp).toBe(false);
    expect(d.bookedRouteId).toBe(B24);
    // The learner's own stop is on this bus; the booked stop is not.
    expect(d.stopId).toBe('stop-49');
  });

  it('allocated elsewhere, booked here: the right bus (was refused before)', () => {
    const d = ok(base({ allocatedRouteId: B24, allocatedStopId: 'stop-24', booking: { routeId: B49, stopId: 'stop-49b' } }));
    expect(d).toEqual({ busRouteId: B49, wrongBus: null, walkUp: false, bookedRouteId: null, stopId: 'stop-49b' });
  });

  it('allocated elsewhere, booked here with no stop: no stop rather than a stop from another bus', () => {
    const d = ok(base({ allocatedRouteId: B24, allocatedStopId: 'stop-24', booking: { routeId: B49, stopId: null } }));
    expect(d.stopId).toBeNull();
  });

  it('allocated elsewhere, no booking: a learner from another bus, recorded here', () => {
    const d = ok(base({ allocatedRouteId: B24, allocatedStopId: 'stop-24' }));
    expect(d).toEqual({
      busRouteId: B49,
      wrongBus: { kind: 'foreign_learner', routeId: B24 },
      walkUp: true,
      bookedRouteId: null,
      stopId: null,
    });
  });

  it('allocated elsewhere, booked on a third bus: told about the booking', () => {
    const d = ok(base({ allocatedRouteId: B24, booking: { routeId: B06, stopId: 's' } }));
    expect(d.wrongBus).toEqual({ kind: 'booked_other_bus', routeId: B06 });
    expect(d.bookedRouteId).toBe(B06);
    expect(d.walkUp).toBe(false);
    expect(d.stopId).toBeNull();
  });

  describe('which bus', () => {
    it('a super admin records where the learner is expected, never a wrong bus', () => {
      expect(ok(base({ staffRouteIds: null, booking: { routeId: B24, stopId: null } })).busRouteId).toBe(B24);
      const d = ok(base({ staffRouteIds: null }));
      expect(d.busRouteId).toBe(B49);
      expect(d.wrongBus).toBeNull();
    });

    it('a staffer on two buses: the booked one wins, then the allocated one', () => {
      expect(ok(base({ staffRouteIds: [B24, B49], booking: { routeId: B24, stopId: null } })).busRouteId).toBe(B24);
      expect(ok(base({ staffRouteIds: [B24, B49] })).busRouteId).toBe(B49);
    });

    it('a staffer on two buses cannot tell which one a stranger boarded', () => {
      const r = decideBus(base({ staffRouteIds: [B24, B06] }));
      expect(r.ok).toBe(false);
    });

    it('a staffer with no bus is refused', () => {
      const r = decideBus(base({ staffRouteIds: [] }));
      expect(r).toEqual({ ok: false, error: expect.stringContaining('not assigned') });
    });

    it('a super admin scanning a learner with no route and no booking is refused', () => {
      const r = decideBus(base({ staffRouteIds: null, allocatedRouteId: null }));
      expect(r).toEqual({ ok: false, error: 'Learner has no allocated route' });
    });

    it('a learner with no bus at all (no route, no booking) is still refused', () => {
      const r = decideBus(base({ allocatedRouteId: null, allocatedStopId: null }));
      expect(r).toEqual({ ok: false, error: 'Learner has no allocated route' });
    });

    it('a learner with no allocated route but a booking here is a normal boarding', () => {
      const d = ok(base({ allocatedRouteId: null, allocatedStopId: null, booking: { routeId: B49, stopId: 's49' } }));
      expect(d).toEqual({ busRouteId: B49, wrongBus: null, walkUp: false, bookedRouteId: null, stopId: 's49' });
    });
  });
});
