import { describe, it, expect } from 'vitest';
import { normalizeStopName, timeToMinutes, bestStopMatch, type MatchStop } from './match';

const OPTS = { timeWindowMin: 15, proximityKm: 1.5 };

const stop = (over: Partial<MatchStop> & { id: string }): MatchStop => ({
  name: null, stopTime: null, lat: null, long: null, ...over,
});

describe('normalizeStopName', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeStopName('  Gandhi-Road,  Stop ')).toBe('gandhi road stop');
  });
});

describe('timeToMinutes', () => {
  it('parses HH:MM and HH:MM:SS', () => {
    expect(timeToMinutes('07:30')).toBe(450);
    expect(timeToMinutes('07:30:00')).toBe(450);
  });
  it('returns null for empty/invalid', () => {
    expect(timeToMinutes(null)).toBe(null);
    expect(timeToMinutes('nope')).toBe(null);
  });
});

describe('bestStopMatch', () => {
  it('matches the same stop name within the time window', () => {
    const from = stop({ id: 'a', name: 'Gandhi Road', stopTime: '07:30' });
    const cands = [stop({ id: 'b', name: 'Gandhi Road', stopTime: '07:35' })];
    const m = bestStopMatch(from, cands, OPTS);
    expect(m?.stopId).toBe('b');
  });

  it('rejects same name when pickup times are far apart', () => {
    const from = stop({ id: 'a', name: 'Gandhi Road', stopTime: '07:30' });
    const cands = [stop({ id: 'b', name: 'Gandhi Road', stopTime: '09:30' })];
    expect(bestStopMatch(from, cands, OPTS)).toBe(null);
  });

  it('matches same name when neither has a time (cannot disprove)', () => {
    const from = stop({ id: 'a', name: 'Gandhi Road' });
    const cands = [stop({ id: 'b', name: 'Gandhi Road' })];
    expect(bestStopMatch(from, cands, OPTS)?.stopId).toBe('b');
  });

  it('matches a differently-named but nearby geocoded stop', () => {
    const from = stop({ id: 'a', name: 'Main Gate', stopTime: '07:30', lat: 11.0, long: 77.0 });
    const cands = [stop({ id: 'b', name: 'College Junction', stopTime: '07:32', lat: 11.001, long: 77.0 })];
    const m = bestStopMatch(from, cands, OPTS);
    expect(m?.stopId).toBe('b');
  });

  it('rejects a far-away differently-named stop', () => {
    const from = stop({ id: 'a', name: 'Main Gate', stopTime: '07:30', lat: 11.0, long: 77.0 });
    const cands = [stop({ id: 'b', name: 'Elsewhere', stopTime: '07:32', lat: 11.5, long: 77.5 })];
    expect(bestStopMatch(from, cands, OPTS)).toBe(null);
  });

  it('prefers the closest pickup time among same-name candidates', () => {
    const from = stop({ id: 'a', name: 'Gandhi Road', stopTime: '07:30' });
    const cands = [
      stop({ id: 'b', name: 'Gandhi Road', stopTime: '07:40' }),
      stop({ id: 'c', name: 'Gandhi Road', stopTime: '07:33' }),
    ];
    expect(bestStopMatch(from, cands, OPTS)?.stopId).toBe('c');
  });

  it('never matches the same stop id', () => {
    const from = stop({ id: 'a', name: 'Gandhi Road', stopTime: '07:30' });
    const cands = [stop({ id: 'a', name: 'Gandhi Road', stopTime: '07:30' })];
    expect(bestStopMatch(from, cands, OPTS)).toBe(null);
  });
});
