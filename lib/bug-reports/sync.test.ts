import { describe, it, expect, vi } from 'vitest';
import { syncReporterChunk } from './sync';

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
