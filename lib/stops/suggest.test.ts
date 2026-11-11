import { describe, it, expect } from 'vitest';
import { haversineMeters } from '../gps/interpolate';
import { suggestStopLocations, haltsOf, downsampleTrack, type TripTrack, type TrackFix } from './suggest';
import type { TripDirection } from './progress';

/**
 * A synthetic bus: drives due east along latitude 11.4 at 10 m/s, reporting every 6 s,
 * and stands still for `seconds` when it reaches each halt.
 */
const LAT = 11.4;
const START_LNG = 77.9;
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT * Math.PI) / 180);
const lngAt = (metres: number) => START_LNG + metres / M_PER_DEG_LNG;
/** 07:00:00 India time on day `d`. */
const sevenAm = (d: number) => Date.UTC(2026, 10, 2 + d, 1, 30, 0);
/** 17:00:00 India time on day `d`. */
const fivePm = (d: number) => Date.UTC(2026, 10, 2 + d, 11, 30, 0);

function drive(opts: {
  tripId: string;
  startMs: number;
  direction?: TripDirection;
  haltsAtM?: number[];
  haltSeconds?: number;
  durationS?: number;
}): TripTrack {
  const { tripId, startMs, direction = 'onward', haltsAtM = [], haltSeconds = 30, durationS = 900 } = opts;
  const fixes: TrackFix[] = [];
  const pending = [...haltsAtM].sort((a, b) => a - b);
  let metres = 0;
  let waitLeft = 0;
  for (let s = 0; s <= durationS; s += 6) {
    fixes.push({ t: startMs + s * 1000, lat: LAT, lng: lngAt(metres) });
    if (waitLeft > 0) {
      waitLeft -= 6;
      continue;
    }
    const next = metres + 60;
    if (pending.length && next >= pending[0]) {
      metres = pending.shift()!;
      waitLeft = haltSeconds;
    } else {
      metres = next;
    }
  }
  return { tripId, direction, fixes };
}

// Stop A: 3,000 m along — an on-time bus arrives at 07:05:00.
// Stop B: 5,700 m along — after a 30 s halt at A, an on-time bus arrives at 07:10:00.
const A_M = 3000;
const B_M = 5700;
const STOPS = [
  { id: 'A', time: '07:05:00', eveningTime: null },
  { id: 'B', time: '07:10:00', eveningTime: null },
];
const metresFrom = (s: { lat: number; lng: number }, alongM: number) =>
  haversineMeters(s, { lat: LAT, lng: lngAt(alongM) });

describe('haltsOf', () => {
  it('finds where the bus stood still, and nothing while it is moving', () => {
    const halts = haltsOf(drive({ tripId: 't', startMs: sevenAm(0), haltsAtM: [A_M] }));
    expect(halts).toHaveLength(1);
    expect(metresFrom(halts[0], A_M)).toBeLessThan(5);
    expect(haltsOf(drive({ tripId: 't', startMs: sevenAm(0) }))).toHaveLength(0);
  });
});

describe('suggestStopLocations', () => {
  it('pins each stop to the place the bus habitually halts', () => {
    const tracks = [0, 1, 2, 3, 4].map((d) =>
      drive({ tripId: `t${d}`, startMs: sevenAm(d), haltsAtM: [A_M, B_M] }),
    );
    const out = suggestStopLocations(STOPS, tracks);
    expect(out.map((s) => s.stopId)).toEqual(['A', 'B']);
    expect(out.every((s) => s.basis === 'halt' && s.trips === 5)).toBe(true);
    expect(metresFrom(out[0], A_M)).toBeLessThan(10);
    expect(metresFrom(out[1], B_M)).toBeLessThan(10);
  });

  it('still finds the halt when some days run late', () => {
    const tracks = [0, 1, 2, 3, 4].map((d) =>
      drive({
        tripId: `t${d}`,
        // Two of five days leave two minutes late: at 07:05 that bus is 1.2 km short.
        startMs: sevenAm(d) + (d >= 3 ? 120_000 : 0),
        haltsAtM: [A_M, B_M],
      }),
    );
    const a = suggestStopLocations(STOPS, tracks).find((s) => s.stopId === 'A')!;
    expect(a.basis).toBe('halt');
    expect(a.trips).toBe(5);
    expect(metresFrom(a, A_M)).toBeLessThan(10);
  });

  it('falls back to where the bus is at the timetabled minute when it never halts', () => {
    const tracks = [0, 1, 2].map((d) => drive({ tripId: `t${d}`, startMs: sevenAm(d) }));
    const a = suggestStopLocations(STOPS, tracks).find((s) => s.stopId === 'A')!;
    expect(a.basis).toBe('schedule');
    expect(a.trips).toBe(3);
    expect(metresFrom(a, A_M)).toBeLessThan(150);
  });

  it('ignores a halt that only one trip made (a breakdown is not a stop)', () => {
    const tracks = [0, 1, 2, 3].map((d) =>
      drive({ tripId: `t${d}`, startMs: sevenAm(d), haltsAtM: d === 0 ? [A_M - 200] : [] }),
    );
    expect(suggestStopLocations(STOPS, tracks).find((s) => s.stopId === 'A')!.basis).toBe('schedule');
  });

  it('suggests nothing from fewer than three trips', () => {
    const tracks = [0, 1].map((d) => drive({ tripId: `t${d}`, startMs: sevenAm(d), haltsAtM: [A_M, B_M] }));
    expect(suggestStopLocations(STOPS, tracks)).toEqual([]);
  });

  it('skips a stop with no timetable, and a stop the trips never reach in time', () => {
    const tracks = [0, 1, 2].map((d) => drive({ tripId: `t${d}`, startMs: sevenAm(d), haltsAtM: [A_M] }));
    const out = suggestStopLocations(
      [
        { id: 'untimed', time: null, eveningTime: null },
        { id: 'A', time: '07:05:00', eveningTime: null },
        { id: 'later', time: '09:30:00', eveningTime: null },
      ],
      tracks,
    );
    expect(out.map((s) => s.stopId)).toEqual(['A']);
  });

  it('uses the evening run when only that was recorded', () => {
    const tracks = [0, 1, 2].map((d) =>
      drive({ tripId: `t${d}`, startMs: fivePm(d), direction: 'return', haltsAtM: [A_M] }),
    );
    const out = suggestStopLocations([{ id: 'A', time: '07:05:00', eveningTime: '17:05:00' }], tracks);
    expect(out).toHaveLength(1);
    expect(out[0].basis).toBe('halt');
    expect(metresFrom(out[0], A_M)).toBeLessThan(10);
  });

  it('never stacks two stops on one halt', () => {
    // Two stops timetabled a minute apart, but the bus only ever halts at the first.
    const tracks = [0, 1, 2, 3].map((d) => drive({ tripId: `t${d}`, startMs: sevenAm(d), haltsAtM: [A_M] }));
    const out = suggestStopLocations(
      [
        { id: 'A', time: '07:05:00', eveningTime: null },
        { id: 'A2', time: '07:05:40', eveningTime: null },
      ],
      tracks,
    );
    expect(out).toHaveLength(2);
    expect(out.filter((s) => s.basis === 'halt')).toHaveLength(1);
    expect(haversineMeters(out[0], out[1])).toBeGreaterThan(40);
  });
});

describe('downsampleTrack', () => {
  it('thins a long track but keeps both ends', () => {
    const fixes = drive({ tripId: 't', startMs: sevenAm(0), durationS: 6000 }).fixes; // 1001 fixes
    const line = downsampleTrack(fixes, 100);
    expect(line.length).toBeLessThanOrEqual(102);
    expect(line[0]).toEqual([fixes[0].lat, fixes[0].lng]);
    expect(line[line.length - 1]).toEqual([fixes[fixes.length - 1].lat, fixes[fixes.length - 1].lng]);
  });

  it('returns nothing for an empty track', () => {
    expect(downsampleTrack([])).toEqual([]);
  });
});
