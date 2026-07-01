import { describe, it, expect } from 'vitest';
import { isFixStale, normalizeCapturedAt, isNewerCapture, STALE_FIX_MS } from './tracking';

describe('isFixStale — stop broadcasting a frozen fix', () => {
  const now = 1_000_000_000;

  it('a just-captured fix is fresh', () => {
    expect(isFixStale(now, now)).toBe(false);
  });

  it('a fix within the staleness window is still fresh', () => {
    expect(isFixStale(now - (STALE_FIX_MS - 1), now)).toBe(false);
  });

  it('a fix older than the window is stale — watchPosition has frozen, so go quiet', () => {
    expect(isFixStale(now - (STALE_FIX_MS + 1), now)).toBe(true);
  });

  it('a future-dated fix (device clock jitter) is never treated as stale', () => {
    expect(isFixStale(now + 5_000, now)).toBe(false);
  });
});

describe('normalizeCapturedAt — the monotonic-guard timestamp', () => {
  const nowMs = Date.parse('2026-07-01T04:04:00.000Z');
  const fallback = '2026-07-01T04:04:00.000Z';

  it('passes a valid client capture time through', () => {
    expect(normalizeCapturedAt('2026-07-01T04:03:50.000Z', fallback, nowMs)).toBe(
      '2026-07-01T04:03:50.000Z'
    );
  });

  it('keeps an OLDER capture time — that is the point: the server rejects a frozen re-send', () => {
    expect(normalizeCapturedAt('2026-07-01T04:02:19.000Z', fallback, nowMs)).toBe(
      '2026-07-01T04:02:19.000Z'
    );
  });

  it('falls back when the field is missing (old client bundle — stays backward compatible)', () => {
    expect(normalizeCapturedAt(undefined, fallback, nowMs)).toBe(fallback);
  });

  it('falls back on an unparseable value', () => {
    expect(normalizeCapturedAt('not-a-date', fallback, nowMs)).toBe(fallback);
  });

  it('clamps a near-future capture time to server-now (fast device clock cannot poison the guard)', () => {
    // 30s ahead of server-now must NOT pass through — it clamps to the fallback (server-now).
    expect(normalizeCapturedAt('2026-07-01T04:04:30.000Z', fallback, nowMs)).toBe(fallback);
  });

  it('clamps an absurd far-future time to server-now', () => {
    expect(normalizeCapturedAt('2027-01-01T00:00:00.000Z', fallback, nowMs)).toBe(fallback);
  });
});

describe('isNewerCapture — the monotonic guard', () => {
  const stored = '2026-07-01T04:04:00.000Z';

  it('advances the very first fix (nothing stored yet)', () => {
    expect(isNewerCapture(null, stored)).toBe(true);
  });

  it('advances a strictly newer fix (the live, moving bus)', () => {
    expect(isNewerCapture(stored, '2026-07-01T04:04:12.000Z')).toBe(true);
  });

  it('REJECTS a frozen re-send at the same capture time', () => {
    expect(isNewerCapture(stored, stored)).toBe(false);
  });

  it('REJECTS a stale re-send captured earlier than what is stored', () => {
    expect(isNewerCapture(stored, '2026-07-01T04:02:19.000Z')).toBe(false);
  });

  it('rejects an unparseable incoming time rather than clobbering', () => {
    expect(isNewerCapture(stored, 'not-a-date')).toBe(false);
  });
});
