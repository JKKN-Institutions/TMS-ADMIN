import { describe, expect, it } from 'vitest';
import { memoryKv } from './kv';
import {
  addProblem, countPending, deferIfSame, dismissProblem, enqueueMark, enqueueScan,
  listOutbox, listProblems, removeIfSame, type OutboxEntry,
} from './outbox';

const NOW = new Date('2026-09-11T03:00:00Z'); // 08:30 IST
const ids = () => { let n = 0; return () => `c${++n}`; };
const mark = (
  learnerId: string,
  status: 'present' | 'absent' = 'present',
  userId = 'u1',
  direction: 'onward' | 'return' = 'onward',
) => ({ userId, learnerId, routeId: 'r1', status, name: `L-${learnerId}`, direction });
const scan = (learnerId: string | null, token: string) =>
  ({ userId: 'u1', learnerId, token, walkUp: false, name: learnerId, verified: learnerId !== null, direction: 'onward' as const });

describe('outbox', () => {
  it('stores a mark with its tap time and IST trip date', async () => {
    const kv = memoryKv();
    const e = await enqueueMark(kv, mark('l1'), NOW, ids());
    expect(e).toMatchObject({ kind: 'mark', clientId: 'c1', direction: 'onward', tappedAt: NOW.toISOString(), tripDate: '2026-09-11', attempts: 0, nextAttemptAt: 0 });
    const lateIst = new Date('2026-09-11T19:00:00Z'); // 00:30 IST on the 12th
    expect((await enqueueMark(kv, mark('l2'), lateIst, ids())).tripDate).toBe('2026-09-12');
  });

  it('keeps only the latest unsent mark per learner and day', async () => {
    const kv = memoryKv();
    const id = ids();
    await enqueueMark(kv, mark('l1', 'present'), NOW, id);
    await enqueueMark(kv, mark('l1', 'absent'), new Date(NOW.getTime() + 1000), id);
    const all = await listOutbox(kv, 'u1');
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: 'absent', clientId: 'c2' });
  });

  it('keeps the morning and evening marks of one learner apart', async () => {
    const kv = memoryKv();
    const id = ids();
    await enqueueMark(kv, mark('l1', 'present', 'u1', 'onward'), NOW, id);
    await enqueueMark(kv, mark('l1', 'absent', 'u1', 'return'), NOW, id);
    expect((await listOutbox(kv, 'u1')).map((e) => e.direction).sort()).toEqual(['onward', 'return']);
  });

  it('collapses a resolved scan with a mark for the same learner, but not raw scans', async () => {
    const kv = memoryKv();
    const id = ids();
    await enqueueMark(kv, mark('l1', 'absent'), NOW, id);
    await enqueueScan(kv, scan('l1', 't'), NOW, id);
    await enqueueScan(kv, scan(null, 'x'), NOW, id);
    await enqueueScan(kv, scan(null, 'y'), NOW, id);
    const all = await listOutbox(kv, 'u1');
    expect(all.map((e) => e.kind)).toEqual(['scan', 'scan', 'scan']);
    expect(await countPending(kv, 'u1')).toBe(3);
  });

  it('lists one user only, oldest tap first', async () => {
    const kv = memoryKv();
    const id = ids();
    await enqueueMark(kv, mark('l2'), new Date(NOW.getTime() + 5000), id);
    await enqueueMark(kv, mark('l1'), NOW, id);
    await enqueueMark(kv, mark('l9', 'present', 'u2'), NOW, id);
    expect((await listOutbox(kv, 'u1')).map((e) => e.learnerId)).toEqual(['l1', 'l2']);
  });

  it('never removes a newer mark that replaced the one being settled', async () => {
    const kv = memoryKv();
    const id = ids();
    const old = await enqueueMark(kv, mark('l1', 'present'), NOW, id);
    await enqueueMark(kv, mark('l1', 'absent'), NOW, id);
    await removeIfSame(kv, old);
    expect((await listOutbox(kv, 'u1'))[0]).toMatchObject({ clientId: 'c2', status: 'absent' });
  });

  it('backs off 5s, 15s, then 60s', async () => {
    const kv = memoryKv();
    let e: OutboxEntry = await enqueueMark(kv, mark('l1'), NOW, ids());
    const t = NOW.getTime();
    for (const [i, wait] of [[1, 5_000], [2, 15_000], [3, 60_000], [4, 60_000]] as const) {
      await deferIfSame(kv, e, NOW);
      e = (await listOutbox(kv, 'u1'))[0];
      expect(e.attempts).toBe(i);
      expect(e.nextAttemptAt).toBe(t + wait);
    }
  });

  it('keeps, lists and dismisses problems per user', async () => {
    const kv = memoryKv();
    const base = { userId: 'u1', learnerId: 'l1', name: 'A', reason: 'stale' as const, message: 'm', tappedAt: NOW.toISOString() };
    await addProblem(kv, { ...base, clientId: 'p1', recordedAt: '2026-09-11T03:00:00Z' });
    await addProblem(kv, { ...base, clientId: 'p2', recordedAt: '2026-09-11T03:05:00Z' });
    await addProblem(kv, { ...base, clientId: 'p3', userId: 'u2', recordedAt: '2026-09-11T03:05:00Z' });
    expect((await listProblems(kv, 'u1')).map((p) => p.clientId)).toEqual(['p2', 'p1']);
    await dismissProblem(kv, 'u1', 'p2');
    expect((await listProblems(kv, 'u1')).map((p) => p.clientId)).toEqual(['p1']);
  });
});
