import { describe, it, expect } from 'vitest';
import { livenessOf, isRecentForMap, agoText, livenessText, compassOf, clockOffsetMs, LIVE_MAX_MS, DELAYED_MAX_MS, MAP_MAX_AGE_MS } from './liveness';

const NOW = Date.parse('2026-11-12T09:00:00+05:30');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('livenessOf', () => {
  it('is live up to two minutes, delayed up to five, then off', () => {
    expect(livenessOf(at(0), NOW)).toBe('live');
    expect(livenessOf(at(LIVE_MAX_MS), NOW)).toBe('live');
    expect(livenessOf(at(LIVE_MAX_MS + 1), NOW)).toBe('delayed');
    expect(livenessOf(at(DELAYED_MAX_MS), NOW)).toBe('delayed');
    expect(livenessOf(at(DELAYED_MAX_MS + 1), NOW)).toBe('off');
  });

  it('never calls a missing or unreadable time live', () => {
    expect(livenessOf(null, NOW)).toBe('off');
    expect(livenessOf('not a date', NOW)).toBe('off');
  });

  it('expires by the clock alone — the same position stops being live as time passes', () => {
    const fix = at(0);
    expect(livenessOf(fix, NOW)).toBe('live');
    expect(livenessOf(fix, NOW + LIVE_MAX_MS + 1000)).toBe('delayed');
    expect(livenessOf(fix, NOW + DELAYED_MAX_MS + 1000)).toBe('off');
  });

  it('treats a position stamped slightly in the future as live, not negative', () => {
    expect(livenessOf(new Date(NOW + 3000).toISOString(), NOW)).toBe('live');
  });
});

describe('isRecentForMap', () => {
  it('keeps today\'s positions and drops months-old ones', () => {
    expect(isRecentForMap(at(MAP_MAX_AGE_MS), NOW)).toBe(true);
    expect(isRecentForMap(at(MAP_MAX_AGE_MS + 1), NOW)).toBe(false);
    expect(isRecentForMap('2026-08-24T18:35:00+05:30', NOW)).toBe(false);
    expect(isRecentForMap(null, NOW)).toBe(false);
  });
});

describe('wording', () => {
  it('reads as seconds, minutes, then a clock time, then a date', () => {
    expect(agoText(at(3000), NOW)).toBe('just now');
    expect(agoText(at(42_000), NOW)).toBe('40 s ago');
    expect(agoText(at(3 * 60_000), NOW)).toBe('3 min ago');
    expect(agoText('2026-08-24T18:35:00+05:30', NOW)).toMatch(/24 Aug/);
    expect(agoText(null, NOW)).toBe('never');
  });

  it('never words an old position as live', () => {
    expect(livenessText(at(5000), NOW)).toBe('Live');
    expect(livenessText(at(3 * 60_000), NOW)).toBe('Delayed · 3 min ago');
    expect(livenessText(at(20 * 60_000), NOW)).toMatch(/^Last seen /);
    expect(livenessText(null, NOW)).toBe('No position yet');
  });

  it('names the compass direction', () => {
    expect(compassOf(0)).toBe('N');
    expect(compassOf(44)).toBe('NE');
    expect(compassOf(359)).toBe('N');
    expect(compassOf(-90)).toBe('W');
    expect(compassOf(null)).toBeNull();
  });
});

describe('clockOffsetMs', () => {
  it('corrects a phone clock that runs fast, so a live bus is still live', () => {
    const phoneNow = NOW + 10 * 60_000; // phone is ten minutes ahead of the server
    const offset = clockOffsetMs(new Date(NOW).toISOString(), phoneNow);
    expect(offset).toBe(-10 * 60_000);
    const fix = at(5000); // reported five seconds ago by the server's clock
    expect(livenessOf(fix, phoneNow)).toBe('off'); // what the raw phone clock would say
    expect(livenessOf(fix, phoneNow + offset)).toBe('live');
  });

  it('corrects a phone clock that runs slow, so a stale bus is not called live', () => {
    const phoneNow = NOW - 10 * 60_000;
    const offset = clockOffsetMs(new Date(NOW).toISOString(), phoneNow);
    const fix = at(8 * 60_000); // eight minutes old
    expect(livenessOf(fix, phoneNow)).toBe('live'); // the raw phone clock is fooled
    expect(livenessOf(fix, phoneNow + offset)).toBe('off');
  });

  it('applies no correction when the server sent no time', () => {
    expect(clockOffsetMs(undefined, NOW)).toBe(0);
    expect(clockOffsetMs('nonsense', NOW)).toBe(0);
    expect(clockOffsetMs(new Date(NOW).toISOString(), 0)).toBe(0);
  });
});
