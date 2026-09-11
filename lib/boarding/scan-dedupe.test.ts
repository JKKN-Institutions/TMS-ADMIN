import { describe, it, expect } from 'vitest';
import { noteRead, SAME_CARD_GAP_MS } from './scan-dedupe';

describe('noteRead', () => {
  it('lets the first read of a card through', () => {
    expect(noteRead(null, '348295-7', 0).ignore).toBe(false);
  });

  it('ignores the same card read again while it is still in view', () => {
    const first = noteRead(null, '348295-7', 0);
    // 2.6s later is exactly the re-read seen in production: a ~1s request
    // plus the 1.5s post-request cooldown, with the card never moved.
    expect(noteRead(first.last, '348295-7', 2_600).ignore).toBe(true);
  });

  it('never re-submits a card held in view, however long it stays there', () => {
    // A camera decodes ~10 times a second. Hold the card for 30 seconds.
    let last = noteRead(null, '348295-7', 0).last;
    const submitted: number[] = [];
    for (let t = 100; t <= 30_000; t += 100) {
      const r = noteRead(last, '348295-7', t);
      if (!r.ignore) submitted.push(t);
      last = r.last;
    }
    expect(submitted).toEqual([]);
  });

  it('lets the same card through again once it has been out of view for the gap', () => {
    const first = noteRead(null, '348295-7', 0);
    expect(noteRead(first.last, '348295-7', SAME_CARD_GAP_MS).ignore).toBe(false);
  });

  it('lets a different card through immediately', () => {
    const first = noteRead(null, '348295-7', 0);
    expect(noteRead(first.last, '111111-1', 100).ignore).toBe(false);
  });

  it('honours a custom gap', () => {
    const first = noteRead(null, 'A', 0);
    expect(noteRead(first.last, 'A', 999, 1_000).ignore).toBe(true);
    expect(noteRead(first.last, 'A', 1_000, 1_000).ignore).toBe(false);
  });
});
