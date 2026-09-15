// lib/boarding/offline/snapshot-marking.test.ts
import { describe, it, expect } from 'vitest';
import { memoryKv } from './kv';
import { saveMarking, loadMarking } from './snapshot';

describe('marking snapshot', () => {
  it('round-trips per user', async () => {
    const kv = memoryKv();
    const now = new Date('2026-09-15T03:00:00Z');
    await saveMarking(kv, 'u1', { mode: 'scan_only', manual: false, scan: true }, now);
    expect((await loadMarking(kv, 'u1'))?.value).toEqual({ mode: 'scan_only', manual: false, scan: true });
    expect(await loadMarking(kv, 'u2')).toBeNull();
  });
});
