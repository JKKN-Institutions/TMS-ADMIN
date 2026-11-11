import { describe, it, expect } from 'vitest';
import {
  stopProgress,
  summariseProgress,
  inferDirection,
  istSecondsOfDay,
  clockToSeconds,
  scheduledClock,
  formatDistance,
  type StopPin,
} from './progress';

// Four stops in a straight west-to-east line, ~1.1 km apart (0.01° of longitude at
// 11.4° N), numbered in morning order: the bus drives 1 → 2 → 3 → 4 to college.
const pin = (order: number, lng: number, name: string): StopPin => ({
  id: `s${order}`,
  name,
  order,
  lat: 11.4,
  lng,
  time: `07:${10 + order * 5}:00`,
  eveningTime: `18:${40 - order * 5}:00`,
  isMajor: false,
});
const STOPS: StopPin[] = [
  pin(1, 77.9, 'FIRST'),
  pin(2, 77.91, 'SECOND'),
  pin(3, 77.92, 'THIRD'),
  pin(4, 77.93, 'COLLEGE'),
];
const at = (lng: number, lat = 11.4) => ({ lat, lng });

describe('stopProgress', () => {
  it('returns null with no bus position or no stops', () => {
    expect(stopProgress(STOPS, null, 'onward')).toBeNull();
    expect(stopProgress([], at(77.9), 'onward')).toBeNull();
  });

  it('places a bus between two stops: earlier ones passed, the one ahead is next', () => {
    const p = stopProgress(STOPS, at(77.915), 'onward')!;
    expect(p.states).toEqual(['passed', 'passed', 'next', 'upcoming']);
    expect(p.nextIndex).toBe(2);
    expect(p.atStop).toBe(false);
    expect(p.nextDistanceM).toBeGreaterThan(400);
    expect(p.nextDistanceM).toBeLessThan(700);
  });

  it('reverses for the evening run: the same spot now has the later-numbered stops behind it', () => {
    const p = stopProgress(STOPS, at(77.915), 'return')!;
    expect(p.states).toEqual(['upcoming', 'next', 'passed', 'passed']);
    expect(p.nextIndex).toBe(1);
  });

  it('keeps a stop as next while the bus is standing at it', () => {
    const p = stopProgress(STOPS, at(77.9101), 'onward')!;
    expect(p.atStop).toBe(true);
    expect(p.nearestIndex).toBe(1);
    expect(p.states).toEqual(['passed', 'next', 'upcoming', 'upcoming']);
  });

  it('marks nothing passed before the first stop', () => {
    const p = stopProgress(STOPS, at(77.88), 'onward')!;
    expect(p.states).toEqual(['next', 'upcoming', 'upcoming', 'upcoming']);
    expect(p.nextIndex).toBe(0);
  });

  it('marks everything passed beyond the last stop, with no next stop', () => {
    const p = stopProgress(STOPS, at(77.95), 'onward')!;
    expect(p.states).toEqual(['passed', 'passed', 'passed', 'passed']);
    expect(p.nextIndex).toBeNull();
    expect(p.nextDistanceM).toBeNull();
  });

  it('claims nothing about passed or next when the direction is unknown', () => {
    const p = stopProgress(STOPS, at(77.915), null)!;
    expect(p.states).toEqual(['plain', 'plain', 'plain', 'plain']);
    expect(p.nextIndex).toBeNull();
    expect([1, 2]).toContain(p.nearestIndex);
  });

  it('follows sequence_order, not array order', () => {
    const shuffled = [STOPS[2], STOPS[0], STOPS[3], STOPS[1]];
    const p = stopProgress(shuffled, at(77.915), 'onward')!;
    // shuffled = [THIRD, FIRST, COLLEGE, SECOND]
    expect(p.states).toEqual(['next', 'passed', 'upcoming', 'passed']);
  });

  it('handles a route with a single located stop', () => {
    const p = stopProgress([STOPS[1]], at(77.95), 'onward')!;
    expect(p.states).toEqual(['next']);
    expect(p.nextIndex).toBe(0);
  });

  it('still places a bus that is off the line (on a parallel road)', () => {
    const p = stopProgress(STOPS, at(77.915, 11.405), 'onward')!;
    expect(p.states).toEqual(['passed', 'passed', 'next', 'upcoming']);
  });
});

describe('summariseProgress', () => {
  it('names the next stop with distance and the due time for the run', () => {
    const p = stopProgress(STOPS, at(77.915), 'onward');
    const s = summariseProgress(STOPS, p, 'onward')!;
    expect(s.headline).toBe('Next stop: THIRD');
    expect(s.detail).toMatch(/^\d+ m away · due 07:25$/);
  });

  it('uses the evening time on the return run', () => {
    const p = stopProgress(STOPS, at(77.915), 'return');
    expect(summariseProgress(STOPS, p, 'return')!.detail).toMatch(/due 18:30$/);
  });

  it('says "At <stop>" when the bus is standing there', () => {
    const p = stopProgress(STOPS, at(77.92), 'onward');
    expect(summariseProgress(STOPS, p, 'onward')).toEqual({ headline: 'At THIRD', detail: 'Due 07:25' });
  });

  it('says so once the bus is past the last stop', () => {
    const p = stopProgress(STOPS, at(77.95), 'onward');
    expect(summariseProgress(STOPS, p, 'onward')!.headline).toBe('Past the last stop');
  });

  it('falls back to "Near <stop>" when the direction is unknown', () => {
    const p = stopProgress(STOPS, at(77.903), null);
    expect(summariseProgress(STOPS, p, null)!.headline).toBe('Near FIRST');
  });

  it('is null without progress', () => {
    expect(summariseProgress(STOPS, null, 'onward')).toBeNull();
  });
});

describe('clock helpers', () => {
  it('reads India time from a UTC instant', () => {
    // 2026-11-10 01:40:00 UTC = 07:10:00 IST
    expect(istSecondsOfDay(Date.UTC(2026, 10, 10, 1, 40, 0))).toBe(7 * 3600 + 10 * 60);
    // 20:00 UTC = 01:30 IST the next day
    expect(istSecondsOfDay(Date.UTC(2026, 10, 10, 20, 0, 0))).toBe(1 * 3600 + 30 * 60);
  });

  it('parses stop times', () => {
    expect(clockToSeconds('07:25:00')).toBe(7 * 3600 + 25 * 60);
    expect(clockToSeconds('18:05')).toBe(18 * 3600 + 5 * 60);
    expect(clockToSeconds(null)).toBeNull();
    expect(clockToSeconds('25:00:00')).toBeNull();
    expect(clockToSeconds('soon')).toBeNull();
  });

  it('trusts an active trip, else splits the day at 1 pm India time', () => {
    const morning = Date.UTC(2026, 10, 10, 2, 0, 0); // 07:30 IST
    const evening = Date.UTC(2026, 10, 10, 12, 0, 0); // 17:30 IST
    expect(inferDirection('return', morning)).toBe('return');
    expect(inferDirection('onward', evening)).toBe('onward');
    expect(inferDirection(null, morning)).toBe('onward');
    expect(inferDirection(undefined, evening)).toBe('return');
    expect(inferDirection('sideways', evening)).toBe('return');
  });

  it('picks the scheduled time for the run', () => {
    expect(scheduledClock(STOPS[0], 'onward')).toBe('07:15');
    expect(scheduledClock(STOPS[0], 'return')).toBe('18:35');
    expect(scheduledClock(STOPS[0], null)).toBe('07:15');
    expect(scheduledClock({ time: null, eveningTime: null }, 'onward')).toBeNull();
  });

  it('formats distances', () => {
    expect(formatDistance(84)).toBe('80 m');
    expect(formatDistance(995)).toBe('1.0 km');
    expect(formatDistance(1234)).toBe('1.2 km');
  });
});
