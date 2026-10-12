import { describe, it, expect, vi } from 'vitest';
import { countStatusChanges, refreshIndexedStatuses, syncReporterChunk } from './sync';

const reportsFor = (email: string, ids: string[]) => ({
  success: true,
  data: {
    bug_reports: ids.map((id) => ({
      id,
      page_url: 'https://tms.jkkn.ac.in/student/bookings',
      status: 'new',
      metadata: { title: `t-${id}`, reporter_email: email },
    })),
  },
});

/** Minimal stand-in for the Supabase client surface syncReporterChunk touches. */
function fakeSvc() {
  const upserted: unknown[] = [];
  return {
    upserted,
    from: () => ({
      upsert: (rows: unknown) => {
        upserted.push(rows);
        return Promise.resolve({ error: null });
      },
    }),
  };
}

describe('syncReporterChunk', () => {
  it('collects reports across several reporters and upserts them once', async () => {
    const svc = fakeSvc();
    const fetchFor = vi.fn(async (email: string) =>
      email === 'a@x.com' ? reportsFor(email, ['1', '2']) : email === 'b@x.com' ? reportsFor(email, ['3']) : reportsFor(email, [])
    );

    const res = await syncReporterChunk(svc as never, ['a@x.com', 'b@x.com', 'c@x.com'], fetchFor);

    expect(res).toMatchObject({ scanned: 3, reporters: 2, found: 3, upserted: 3, errors: 0 });
    expect(fetchFor).toHaveBeenCalledTimes(3);
    expect(svc.upserted).toHaveLength(1); // one batched write, not one per report
  });

  it('does not write at all when nothing is found', async () => {
    const svc = fakeSvc();
    const res = await syncReporterChunk(svc as never, ['a@x.com'], async (e) => reportsFor(e, []));
    expect(res).toMatchObject({ scanned: 1, reporters: 0, found: 0, upserted: 0, errors: 0 });
    expect(svc.upserted).toHaveLength(0);
  });

  it('counts a failing reporter as an error and still processes the others', async () => {
    const svc = fakeSvc();
    const fetchFor = async (email: string) => {
      if (email === 'boom@x.com') throw new Error('platform 500');
      return reportsFor(email, ['9']);
    };
    const res = await syncReporterChunk(svc as never, ['boom@x.com', 'ok@x.com'], fetchFor);
    expect(res).toMatchObject({ scanned: 2, errors: 1, found: 1, upserted: 1 });
  });

  it('reports an upsert failure instead of silently claiming success', async () => {
    const svc = {
      from: () => ({ upsert: () => Promise.resolve({ error: { code: '42P01', message: 'missing table' } }) }),
    };
    const res = await syncReporterChunk(svc as never, ['a@x.com'], async (e) => reportsFor(e, ['1']));
    expect(res.upserted).toBe(0);
    expect(res.writeError).toContain('missing table');
  });

  it('de-duplicates a report seen under two addresses', async () => {
    const svc = fakeSvc();
    // Same platform id echoed for two different queried addresses.
    const res = await syncReporterChunk(svc as never, ['a@x.com', 'b@x.com'], async (e) => reportsFor(e, ['same']));
    expect(res.found).toBe(1);
    expect(res.upserted).toBe(1);
  });

  it('handles an empty chunk without touching the network or the database', async () => {
    const svc = fakeSvc();
    const fetchFor = vi.fn();
    const res = await syncReporterChunk(svc as never, [], fetchFor as never);
    expect(res).toMatchObject({ scanned: 0, found: 0, upserted: 0 });
    expect(fetchFor).not.toHaveBeenCalled();
    expect(svc.upserted).toHaveLength(0);
  });
});

/** reportsFor, but with a chosen platform status per id. */
const reportsWithStatus = (email: string, items: [string, string][]) => ({
  success: true,
  data: {
    bug_reports: items.map(([id, status]) => ({
      id,
      page_url: 'https://tms.jkkn.ac.in/student/bookings',
      status,
      metadata: { title: `t-${id}`, reporter_email: email },
    })),
  },
});

/** Fake client whose index already holds `indexed`, recording what gets upserted. */
function indexedSvc(indexed: { id: string; status: string; reporter_email: string }[]) {
  const upserted: Record<string, unknown>[][] = [];
  return {
    upserted,
    from: () => ({
      select: () => Promise.resolve({ data: indexed, error: null }),
      upsert: (rows: Record<string, unknown>[]) => {
        upserted.push(rows);
        return Promise.resolve({ error: null });
      },
    }),
  };
}

describe('refreshIndexedStatuses', () => {
  it('asks only the indexed reporters, once each, and counts status changes', async () => {
    const svc = indexedSvc([
      { id: '1', status: 'open', reporter_email: 'a@x.com' },
      { id: '2', status: 'open', reporter_email: 'a@x.com' },
      { id: '3', status: 'resolved', reporter_email: 'b@x.com' },
    ]);
    const fetchFor = vi.fn(async (email: string) =>
      email === 'a@x.com'
        ? reportsWithStatus(email, [['1', 'closed'], ['2', 'new']])
        : reportsWithStatus(email, [['3', 'resolved']])
    );

    const res = await refreshIndexedStatuses(svc as never, fetchFor);

    expect(fetchFor).toHaveBeenCalledTimes(2); // de-duplicated addresses
    // 1: open -> closed changed. 2: new folds to open, unchanged. 3: unchanged.
    expect(res).toMatchObject({ scanned: 2, found: 3, upserted: 3, statusChanges: 1 });
    const written = svc.upserted[0].find((r) => r.id === '1');
    expect(written).toMatchObject({ status: 'closed' });
    expect(typeof written?.updated_at).toBe('string'); // refresh is visible in updated_at
  });

  it('does not call the platform when the index is empty', async () => {
    const svc = indexedSvc([]);
    const fetchFor = vi.fn();
    const res = await refreshIndexedStatuses(svc as never, fetchFor as never);
    expect(fetchFor).not.toHaveBeenCalled();
    expect(res).toMatchObject({ scanned: 0, upserted: 0, statusChanges: 0 });
  });

  it('reports an index read failure rather than claiming nothing changed', async () => {
    const svc = {
      from: () => ({ select: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'missing' } }) }),
    };
    const res = await refreshIndexedStatuses(svc as never, vi.fn() as never);
    expect(res.writeError).toContain('missing');
  });
});

describe('countStatusChanges', () => {
  const row = (id: string, status: string) => ({ id, status }) as never;

  it('ignores reports that were not indexed before', () => {
    expect(countStatusChanges(new Map([['1', 'open']]), [row('1', 'open'), row('new', 'closed')])).toBe(0);
  });

  it('counts each indexed report whose status moved', () => {
    expect(countStatusChanges(new Map([['1', 'open'], ['2', 'open']]), [row('1', 'closed'), row('2', 'resolved')])).toBe(2);
  });
});
