import { describe, it, expect } from 'vitest';
import { estimateArrival, delayText, type TimetableStop } from './arrival';
import { stopProgress, type StopPin } from './progress';

// Four stops in a line heading north, roughly 1.1 km apart.
const pin = (n: number, time: string, eveningTime: string): StopPin => ({
  id: `s${n}`, name: `STOP ${n}`, order: n, lat: 11.0 + n * 0.01, lng: 77.0, time, eveningTime, isMajor: false,
});
const pins = [pin(1, '07:00:00', '18:30:00'), pin(2, '07:10:00', '18:20:00'), pin(3, '07:20:00', '18:10:00'), pin(4, '07:30:00', '18:00:00')];
const timetable: TimetableStop[] = pins.map(({ id, name, order, time, eveningTime }) => ({ id, name, order, time, eveningTime }));

/** Epoch ms for an India-time clock on an arbitrary day. */
const ist = (hh: number, mm: number) => Date.UTC(2026, 10, 11, hh, mm) - 5.5 * 3600_000;

describe('estimateArrival', () => {
  it('returns only the timetable time when no bus is live', () => {
    const a = estimateArrival({ timetable, pins, progress: null, direction: 'onward', myStopId: 's3', nowMs: ist(6, 50) });
    expect(a).toEqual({ scheduled: '07:20', eta: null, delayMin: null, stopsAway: null, passed: false });
  });

  it('uses the evening time on the return run', () => {
    const a = estimateArrival({ timetable, pins, progress: null, direction: 'return', myStopId: 's3', nowMs: ist(17, 50) });
    expect(a?.scheduled).toBe('18:10');
  });

  it('carries the delay at the next stop forward to my stop', () => {
    // Bus stands at stop 2 at 07:16 — six minutes after its 07:10 time.
    const bus = { lat: pins[1].lat, lng: pins[1].lng };
    const progress = stopProgress(pins, bus, 'onward');
    const a = estimateArrival({ timetable, pins, progress, direction: 'onward', myStopId: 's4', nowMs: ist(7, 16) });
    expect(a?.delayMin).toBe(6);
    expect(a?.eta).toBe('07:36');
    expect(a?.stopsAway).toBe(3);
    expect(a?.passed).toBe(false);
  });

  it('says the bus has passed once it is beyond my stop', () => {
    const bus = { lat: 11.035, lng: 77.0 }; // between stop 3 and stop 4
    const progress = stopProgress(pins, bus, 'onward');
    const a = estimateArrival({ timetable, pins, progress, direction: 'onward', myStopId: 's2', nowMs: ist(7, 25) });
    expect(a?.passed).toBe(true);
    expect(a?.eta).toBeNull();
  });

  it('reads the route backwards on the return run', () => {
    const bus = { lat: 11.035, lng: 77.0 }; // left stop 4, heading to stop 3
    const progress = stopProgress(pins, bus, 'return');
    const mine = estimateArrival({ timetable, pins, progress, direction: 'return', myStopId: 's1', nowMs: ist(18, 5) });
    expect(mine?.passed).toBe(false);
    expect(mine?.stopsAway).toBe(3);
    const behind = estimateArrival({ timetable, pins, progress, direction: 'return', myStopId: 's4', nowMs: ist(18, 5) });
    expect(behind?.passed).toBe(true);
  });

  it('reports zero stops away while the bus stands at my stop', () => {
    const progress = stopProgress(pins, { lat: pins[2].lat, lng: pins[2].lng }, 'onward');
    const a = estimateArrival({ timetable, pins, progress, direction: 'onward', myStopId: 's3', nowMs: ist(7, 21) });
    expect(a?.stopsAway).toBe(0);
    expect(a?.eta).toBe('07:21');
  });

  it('works when my stop has no map location yet', () => {
    const located = [pins[0], pins[1], pins[3]]; // stop 3 not placed
    const progress = stopProgress(located, { lat: pins[0].lat, lng: pins[0].lng }, 'onward');
    const a = estimateArrival({ timetable, pins: located, progress, direction: 'onward', myStopId: 's3', nowMs: ist(7, 2) });
    expect(a?.scheduled).toBe('07:20');
    expect(a?.eta).toBe('07:22');
    expect(a?.stopsAway).toBe(3);
  });

  it('refuses an absurd delay rather than print a wrong time', () => {
    // Timetable says 07:10 but it is 11:00: the bus is not "230 minutes late", the data is off.
    const progress = stopProgress(pins, { lat: pins[1].lat, lng: pins[1].lng }, 'onward');
    const a = estimateArrival({ timetable, pins, progress, direction: 'onward', myStopId: 's4', nowMs: ist(11, 0) });
    expect(a?.eta).toBeNull();
    expect(a?.scheduled).toBe('07:30');
  });

  it('returns null when the learner has no stop on this route', () => {
    expect(estimateArrival({ timetable, pins, progress: null, direction: 'onward', myStopId: 'nope', nowMs: ist(7, 0) })).toBeNull();
  });
});

describe('delayText', () => {
  it('words the delay plainly', () => {
    expect(delayText(6)).toBe('6 min late');
    expect(delayText(-4)).toBe('4 min early');
    expect(delayText(1)).toBe('on time');
    expect(delayText(null)).toBeNull();
  });
});
