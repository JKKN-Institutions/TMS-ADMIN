import { describe, it, expect } from 'vitest';
import { createScanQueue, onRead, onDone, resetScanQueue, MAX_QUEUED } from './scan-queue';

const GAP = 4_000;

describe('scan-queue', () => {
  it('sends a new card straight away when nothing is saving', () => {
    const s = createScanQueue();
    expect(onRead(s, 'A', 0, GAP)).toBe('submit');
    expect(s.inFlight).toBe('A');
  });

  it('ignores the same card held in view, however long', () => {
    const s = createScanQueue();
    onRead(s, 'A', 0, GAP);
    onDone(s, 800);
    for (let t = 900; t < 20_000; t += 100) expect(onRead(s, 'A', t, GAP)).toBe('ignore');
  });

  it('queues the next card read while the first is saving, then sends it (the lost-card bug)', () => {
    const s = createScanQueue();
    expect(onRead(s, 'A', 0, GAP)).toBe('submit');
    expect(onRead(s, 'B', 300, GAP)).toBe('queued');
    // B stays in view while A saves: must not queue twice.
    expect(onRead(s, 'B', 400, GAP)).toBe('ignore');
    expect(onDone(s, 900)).toBe('B');
    expect(s.inFlight).toBe('B');
    expect(onDone(s, 1_500)).toBeNull();
  });

  it('does not re-send card A while it lingers in view after B has taken over', () => {
    const s = createScanQueue();
    onRead(s, 'A', 0, GAP);
    onRead(s, 'B', 200, GAP);
    onDone(s, 700); // B now saving
    expect(onRead(s, 'A', 800, GAP)).toBe('ignore');
    onDone(s, 1_200);
    expect(onRead(s, 'A', 1_300, GAP)).toBe('ignore');
  });

  it('accepts the same card again after it has been out of view for the gap', () => {
    const s = createScanQueue();
    onRead(s, 'A', 0, GAP);
    onDone(s, 500);
    expect(onRead(s, 'A', 500 + GAP, GAP)).toBe('submit');
  });

  it('starts the same-card gap when a slow save finishes, not when the card was first read', () => {
    const s = createScanQueue();
    onRead(s, 'A', 0, GAP);
    onDone(s, 6_000); // six-second save, card already gone
    expect(onRead(s, 'A', 7_000, GAP)).toBe('ignore');
  });

  it('forgets a card whose request failed, so holding it up again retries', () => {
    const s = createScanQueue();
    onRead(s, 'A', 0, GAP);
    onDone(s, 300, true);
    expect(onRead(s, 'A', 400, GAP)).toBe('submit');
  });

  it('keeps queue order and caps its length', () => {
    const s = createScanQueue();
    onRead(s, 'A', 0, GAP);
    const codes = Array.from({ length: MAX_QUEUED + 2 }, (_, i) => `C${i}`);
    const actions = codes.map((c, i) => onRead(s, c, 10 + i, GAP));
    expect(actions.filter((a) => a === 'queued')).toHaveLength(MAX_QUEUED);
    expect(onDone(s, 100)).toBe('C0');
    expect(onDone(s, 200)).toBe('C1');
    // An overflowed card was not remembered, so it is picked up on its next read.
    expect(onRead(s, `C${MAX_QUEUED}`, 210, GAP)).toBe('queued');
  });

  it('reset forgets everything', () => {
    const s = createScanQueue();
    onRead(s, 'A', 0, GAP);
    onRead(s, 'B', 1, GAP);
    resetScanQueue(s);
    expect(s.inFlight).toBeNull();
    expect(s.queue).toEqual([]);
    expect(onRead(s, 'A', 2, GAP)).toBe('submit');
  });
});
