import { describe, expect, it } from 'vitest';
import { memoryKv } from './kv';
import {
  loadAccess, loadRoster, loadWindows, pruneSnapshots, saveAccess, saveRoster, saveWindows,
} from './snapshot';

const NOW = new Date('2026-09-11T02:12:00Z');

describe('snapshot', () => {
  it('round-trips a roster for one user and day only', async () => {
    const kv = memoryKv();
    await saveRoster(kv, 'u1', '2026-09-11', { rows: [1] }, NOW);
    expect(await loadRoster(kv, 'u1', '2026-09-11')).toEqual({ savedAt: NOW.toISOString(), value: { rows: [1] } });
    expect(await loadRoster(kv, 'u2', '2026-09-11')).toBeNull();
    expect(await loadRoster(kv, 'u1', '2026-09-10')).toBeNull();
  });

  it('round-trips window settings and the access verdict', async () => {
    const kv = memoryKv();
    await saveWindows(kv, 'u1', { onward: { start: '06:45' } }, NOW);
    await saveAccess(kv, 'u1', '2026-09-11', 'in_duty', NOW);
    expect((await loadWindows(kv, 'u1'))?.value).toEqual({ onward: { start: '06:45' } });
    expect(await loadAccess(kv, 'u1', '2026-09-11')).toBe('in_duty');
    expect(await loadAccess(kv, 'u1', '2026-09-12')).toBeNull();
  });

  it('prunes only earlier days for that user', async () => {
    const kv = memoryKv();
    await saveRoster(kv, 'u1', '2026-09-10', {}, NOW);
    await saveRoster(kv, 'u1', '2026-09-11', {}, NOW);
    await saveAccess(kv, 'u1', '2026-09-10', 'in_duty', NOW);
    await saveRoster(kv, 'u2', '2026-09-10', {}, NOW);
    await pruneSnapshots(kv, 'u1', '2026-09-11');
    expect(await loadRoster(kv, 'u1', '2026-09-10')).toBeNull();
    expect(await loadAccess(kv, 'u1', '2026-09-10')).toBeNull();
    expect(await loadRoster(kv, 'u1', '2026-09-11')).not.toBeNull();
    expect(await loadRoster(kv, 'u2', '2026-09-10')).not.toBeNull();
  });
});
