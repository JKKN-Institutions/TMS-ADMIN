import { describe, expect, it, vi } from 'vitest';
import { memoryKv, resilientKv, type Kv } from './kv';

describe('memoryKv', () => {
  it('stores, lists by prefix in key order, and deletes', async () => {
    const kv = memoryKv();
    await kv.set('a:2', { n: 2 });
    await kv.set('a:1', { n: 1 });
    await kv.set('b:1', { n: 3 });
    expect(await kv.get('a:1')).toEqual({ n: 1 });
    expect((await kv.list('a:')).map((e) => e.key)).toEqual(['a:1', 'a:2']);
    await kv.del('a:1');
    expect(await kv.get('a:1')).toBeUndefined();
  });

  it('returns copies, like IndexedDB does', async () => {
    const kv = memoryKv();
    const v = { n: 1 };
    await kv.set('k', v);
    v.n = 99;
    expect(await kv.get('k')).toEqual({ n: 1 });
  });
});

describe('resilientKv', () => {
  it('switches to the fallback for good after the primary throws', async () => {
    const boom = vi.fn(async () => { throw new Error('no indexeddb'); });
    const broken: Kv = { get: boom, set: boom, del: boom, list: boom } as unknown as Kv;
    const fallback = memoryKv();
    const kv = resilientKv(broken, fallback);
    await kv.set('k', 1);
    expect(await kv.get('k')).toBe(1);
    expect(boom).toHaveBeenCalledTimes(1);
  });
});
