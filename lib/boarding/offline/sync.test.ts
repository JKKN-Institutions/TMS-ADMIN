import { describe, expect, it, vi } from 'vitest';
import { memoryKv } from './kv';
import { enqueueMark, enqueueScan, listOutbox, listProblems } from './outbox';
import { syncOnce, syncOutbox, type PostResult, type SyncDeps } from './sync';

const T0 = new Date('2026-09-11T03:00:00Z');
const ids = () => { let n = 0; return () => `c${++n}`; };
const ok = (json: unknown): PostResult => ({ status: 200, json });

async function setup(n = 1, routeId = 'r1') {
  const kv = memoryKv();
  const id = ids();
  for (let i = 1; i <= n; i++) {
    await enqueueMark(kv, { userId: 'u1', learnerId: `l${i}`, routeId, status: 'present', name: `N${i}`, direction: 'onward' }, T0, id);
  }
  return kv;
}

function deps(kv: SyncDeps['kv'], over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    kv, userId: 'u1', now: () => T0,
    postMarks: vi.fn(async (b) => ok({ results: b.marks.map((m: { clientId: string }) => ({ clientId: m.clientId, outcome: 'inserted', walkUp: false })) })),
    postScan: vi.fn(async (b) => ok({ ok: true, clientId: b.clientId })),
    ...over,
  };
}

describe('syncOnce', () => {
  it('removes saved marks and reports them', async () => {
    const kv = await setup(2);
    const r = await syncOnce(deps(kv));
    expect(r.outcomes.map((o) => o.result.outcome)).toEqual(['inserted', 'inserted']);
    expect(r.attempted).toBe(1);
    expect(await listOutbox(kv, 'u1')).toEqual([]);
  });

  it('moves a locked mark to problems with the holder named', async () => {
    const kv = await setup(1);
    await syncOnce(deps(kv, { postMarks: async () => ok({ results: [{ clientId: 'c1', outcome: 'locked', markedByName: 'Kavya' }] }) }));
    expect(await listOutbox(kv, 'u1')).toEqual([]);
    expect(await listProblems(kv, 'u1')).toMatchObject([{ reason: 'locked', message: 'Already marked by Kavya', name: 'N1' }]);
  });

  it('moves a rejected mark to problems with plain words', async () => {
    const kv = await setup(1);
    await syncOnce(deps(kv, { postMarks: async () => ok({ results: [{ clientId: 'c1', outcome: 'rejected', reason: 'stale' }] }) }));
    expect(await listProblems(kv, 'u1')).toMatchObject([
      { reason: 'stale', message: 'It reached the server after midnight, so it no longer counts.' },
    ]);
  });

  it('keeps and backs off on no network, then retries once due', async () => {
    const kv = await setup(1);
    const down = deps(kv, { postMarks: async () => { throw new TypeError('Failed to fetch'); } });
    const r = await syncOnce(down);
    expect(r).toMatchObject({ networkDown: true, deferred: 1 });
    expect((await listOutbox(kv, 'u1'))[0]).toMatchObject({ attempts: 1, nextAttemptAt: T0.getTime() + 5_000 });

    const early = deps(kv, { now: () => new Date(T0.getTime() + 1_000) });
    await syncOnce(early);
    expect(early.postMarks).not.toHaveBeenCalled();

    const due = deps(kv, { now: () => new Date(T0.getTime() + 6_000) });
    await syncOnce(due);
    expect(due.postMarks).toHaveBeenCalledTimes(1);
    expect(await listOutbox(kv, 'u1')).toEqual([]);
  });

  it('stops without touching anything on 401', async () => {
    const kv = await setup(1);
    const r = await syncOnce(deps(kv, { postMarks: async () => ({ status: 401, json: {} }) }));
    expect(r.authRequired).toBe(true);
    expect((await listOutbox(kv, 'u1'))[0]).toMatchObject({ attempts: 0 });
  });

  it('defers on a server error', async () => {
    const kv = await setup(1);
    const r = await syncOnce(deps(kv, { postMarks: async () => ({ status: 500, json: { error: 'x' } }) }));
    expect(r.deferred).toBe(1);
    expect((await listOutbox(kv, 'u1'))[0].attempts).toBe(1);
  });

  it('turns a whole-batch 403 into not_assigned problems', async () => {
    const kv = await setup(2);
    await syncOnce(deps(kv, { postMarks: async () => ({ status: 403, json: { error: 'You are not assigned to this route' } }) }));
    expect((await listProblems(kv, 'u1')).map((p) => p.reason)).toEqual(['not_assigned', 'not_assigned']);
    expect(await listOutbox(kv, 'u1')).toEqual([]);
  });

  it('on not_your_share refuses only the listed learners and keeps the rest', async () => {
    const kv = await setup(2);
    await syncOnce(deps(kv, {
      postMarks: async () => ({ status: 403, json: { reason: 'not_your_share', learners: [{ learner_id: 'l2', staff_email: 'x' }] } }),
    }));
    expect((await listProblems(kv, 'u1')).map((p) => p.learnerId)).toEqual(['l2']);
    expect((await listOutbox(kv, 'u1')).map((e) => e.learnerId)).toEqual(['l1']);
  });

  it('batches 25 per request and per route', async () => {
    const kv = await setup(30, 'r1');
    await enqueueMark(kv, { userId: 'u1', learnerId: 'z1', routeId: 'r2', status: 'present', name: 'Z', direction: 'onward' }, T0, () => 'z');
    const d = deps(kv);
    await syncOnce(d);
    const sizes = (d.postMarks as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].marks.length).sort((a: number, b: number) => a - b);
    expect(sizes).toEqual([1, 5, 25]);
  });

  it('sends each trip as its own batch, naming the trip', async () => {
    const kv = await setup(1);
    await enqueueMark(kv, { userId: 'u1', learnerId: 'l1', routeId: 'r1', status: 'absent', name: 'N1', direction: 'return' }, T0, () => 'eve');
    const d = deps(kv);
    await syncOnce(d);
    const trips = (d.postMarks as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].direction).sort();
    expect(trips).toEqual(['onward', 'return']);
  });

  it('defers a mark the server gave no answer for, never drops it', async () => {
    const kv = await setup(2);
    await syncOnce(deps(kv, { postMarks: async () => ok({ results: [{ clientId: 'c1', outcome: 'inserted', walkUp: false }] }) }));
    expect((await listOutbox(kv, 'u1')).map((e) => [e.learnerId, e.attempts])).toEqual([['l2', 1]]);
  });

  it('keeps a newer tap that replaced the one in flight', async () => {
    const kv = await setup(1);
    await syncOnce(deps(kv, {
      postMarks: async (b) => {
        await enqueueMark(kv, { userId: 'u1', learnerId: 'l1', routeId: 'r1', status: 'absent', name: 'N1', direction: 'onward' }, T0, () => 'newer');
        return ok({ results: [{ clientId: b.marks[0].clientId, outcome: 'inserted', walkUp: false }] });
      },
    }));
    expect(await listOutbox(kv, 'u1')).toMatchObject([{ clientId: 'newer', status: 'absent' }]);
  });

  it('settles scans: saved, not booked, refused', async () => {
    const kv = memoryKv();
    const id = ids();
    const scan = (learnerId: string) =>
      enqueueScan(kv, { userId: 'u1', learnerId, token: `t-${learnerId}`, walkUp: false, name: learnerId, verified: true, direction: 'onward' }, T0, id);
    await scan('s1'); await scan('s2'); await scan('s3');
    await syncOnce(deps(kv, {
      postScan: async (b) =>
        b.token === 't-s1' ? ok({ ok: true })
        : b.token === 't-s2' ? ok({ ok: false, reason: 'not_booked' })
        : { status: 409, json: { ok: false, error: 'This card has been retired. Issue a new one.' } },
    }));
    expect(await listOutbox(kv, 'u1')).toEqual([]);
    expect((await listProblems(kv, 'u1')).map((p) => [p.learnerId, p.reason]).sort()).toEqual([
      ['s2', 'not_booked'], ['s3', 'scan_refused'],
    ]);
  });
});

describe('syncOutbox', () => {
  it('runs at most one sync at a time', async () => {
    const kv = await setup(1);
    const d = deps(kv);
    await Promise.all([syncOutbox(d), syncOutbox(d)]);
    expect(d.postMarks).toHaveBeenCalledTimes(1);
  });
});
