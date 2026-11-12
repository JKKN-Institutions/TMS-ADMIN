import { describe, it, expect } from 'vitest';
import { clusterPoints, type ScreenPoint } from './cluster';

const p = (id: string, x: number, y: number): ScreenPoint => ({ id, x, y });

describe('clusterPoints', () => {
  it('leaves well separated buses alone', () => {
    const out = clusterPoints([p('a', 0, 0), p('b', 200, 0), p('c', 0, 200)], 34);
    expect(out.map((c) => c.ids)).toEqual([['a'], ['b'], ['c']]);
  });

  it('groups buses that would overlap — the four parked at the college', () => {
    const out = clusterPoints([p('r18', 100, 100), p('r20', 103, 101), p('r31', 99, 98), p('r49', 101, 102), p('r24', 600, 40)], 34);
    expect(out).toHaveLength(2);
    expect(out[0].ids).toEqual(['r18', 'r20', 'r31', 'r49']);
    expect(out[0].key).toBe('r18|r20|r31|r49');
    expect(out[0].x).toBeCloseTo(100.75);
    expect(out[1].ids).toEqual(['r24']);
  });

  it('gives the same groups whatever order the buses arrive in', () => {
    const pts = [p('c', 12, 0), p('a', 0, 0), p('b', 6, 0), p('z', 500, 500)];
    const a = clusterPoints(pts, 34).map((c) => c.key);
    const b = clusterPoints([...pts].reverse(), 34).map((c) => c.key);
    expect(a).toEqual(b);
  });

  it('separates as the zoom spreads the same buses apart', () => {
    const near = [p('a', 0, 0), p('b', 10, 0)];
    const far = [p('a', 0, 0), p('b', 80, 0)]; // same buses, three zoom levels in
    expect(clusterPoints(near, 34)).toHaveLength(1);
    expect(clusterPoints(far, 34)).toHaveLength(2);
  });

  it('handles an empty fleet', () => {
    expect(clusterPoints([], 34)).toEqual([]);
  });

  it('stays fast with far more buses than the fleet has', () => {
    const pts: ScreenPoint[] = [];
    for (let i = 0; i < 200; i++) pts.push(p(`bus${String(i).padStart(3, '0')}`, (i * 37) % 1200, (i * 91) % 800));
    const t0 = performance.now();
    for (let k = 0; k < 50; k++) clusterPoints(pts, 34);
    const perCall = (performance.now() - t0) / 50;
    // One animation frame is 16 ms; grouping 200 buses must be a small fraction of it.
    expect(perCall).toBeLessThan(8);
    const total = clusterPoints(pts, 34).reduce((n, c) => n + c.ids.length, 0);
    expect(total).toBe(200); // every bus is in exactly one group
  });
});
