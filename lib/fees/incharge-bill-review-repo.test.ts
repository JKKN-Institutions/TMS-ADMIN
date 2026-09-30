import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/notifications/notify', () => ({ notifyProfile: vi.fn(async () => undefined) }));
vi.mock('@/lib/activity/log', () => ({ logSystemActivity: vi.fn(async () => undefined) }));

import { runInchargeBillReview } from '@/lib/fees/incharge-bill-review-repo';

const PERSON = 'staff-1';
const PROFILE = 'profile-1';
const ROUTE = 'route-1';
const YEAR = 'year-1';

/** Every Mon-Sat of September 2026. */
const SEP_DAYS: string[] = [];
for (let d = 1; d <= 30; d++) {
  const iso = `2026-09-${String(d).padStart(2, '0')}`;
  if (new Date(`${iso}T00:00:00Z`).getUTCDay() !== 0) SEP_DAYS.push(iso);
}

const MARKS = {
  fleet_days: SEP_DAYS,
  route_days: SEP_DAYS.map((d) => ({ route_id: ROUTE, d })),
  person_days: SEP_DAYS.map((d) => ({ profile_id: PROFILE, email: 'a@x.in', d })),
};

const TABLES: Record<string, unknown[]> = {
  tms_transport_year: [{ id: YEAR, name: '2026-27', start_date: '2026-06-01', end_date: '2027-05-31' }],
  tms_fee_bill: [{ id: 'bill-1', person_id: PERSON, amount: '12900' }],
  staff: [{ id: PERSON, first_name: 'A', last_name: 'B', email: 'a@x.in', institution_email: null, profile_id: PROFILE }],
  profiles: [{ id: PROFILE, email: 'a@x.in' }],
  tms_staff_route_assignment: [{ staff_email: 'a@x.in', route_id: ROUTE, assigned_at: '2026-06-02T00:00:00Z', created_at: null }],
  tms_service_calendar: [],
  tms_incharge_excused_day: [],
  tms_incharge_bill_review: [],
};

/** Returns the rows a query WOULD have returned, keyed by table; filters are not applied. */
function makeFake(mode: string, rpcResult: unknown = { status: 'applied', cancelled: 1, amount: 12900, bill_ids: ['bill-1'] }) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'tms_incharge_review_marks') return { data: MARKS, error: null };
    return { data: rpcResult, error: null };
  });
  const upsert = vi.fn(async () => ({ error: null }));
  const from = (table: string) => {
    const rows = table === 'admin_settings' ? [{ settings_data: { mode } }] : TABLES[table] ?? [];
    const b: any = {};
    for (const op of ['select', 'eq', 'in', 'is', 'gte', 'lte', 'limit']) b[op] = () => b;
    b.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    b.upsert = upsert;
    b.update = () => b;
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return b;
  };
  return { svc: { from, rpc } as any, rpc, upsert };
}

const applyCalls = (rpc: ReturnType<typeof vi.fn>) => rpc.mock.calls.filter((c) => c[0] === 'tms_incharge_apply_bill_cancel');
const OCT_5 = new Date('2026-10-05T06:00:00Z');

describe('runInchargeBillReview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('(a) preview mode never applies', async () => {
    const { svc, rpc } = makeFake('preview');
    const s = await runInchargeBillReview(svc, { month: '2026-09', now: OCT_5 });
    expect(applyCalls(rpc)).toHaveLength(0);
    expect(s.passed).toBe(1);
  });

  it('(b) auto + forcePreview never applies', async () => {
    const { svc, rpc } = makeFake('auto');
    const s = await runInchargeBillReview(svc, { month: '2026-09', now: OCT_5, forcePreview: true });
    expect(applyCalls(rpc)).toHaveLength(0);
    expect(s.mode).toBe('preview');
  });

  it('(c) auto but month not ended never applies', async () => {
    const { svc, rpc } = makeFake('auto');
    const s = await runInchargeBillReview(svc, { month: '2026-09', now: new Date('2026-09-20T06:00:00Z') });
    expect(applyCalls(rpc)).toHaveLength(0);
    expect(s.mode).toBe('preview');
  });

  it('(d) auto but month outside the transport year never applies', async () => {
    const { svc, rpc } = makeFake('auto');
    const s = await runInchargeBillReview(svc, { month: '2026-05', now: OCT_5 });
    expect(applyCalls(rpc)).toHaveLength(0);
    expect(s.mode).toBe('preview');
  });

  it('(e) auto, ended month inside the year applies once', async () => {
    const { svc, rpc } = makeFake('auto');
    const s = await runInchargeBillReview(svc, { month: '2026-09', now: OCT_5 });
    const calls = applyCalls(rpc);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ p_person_id: PERSON, p_month: '2026-09-01', p_transport_year_id: YEAR });
    expect(s.mode).toBe('auto');
    expect(s.cancelledPeople).toBe(1);
    expect(s.cancelledAmount).toBe(12900);
  });

  it('(f) off mode skips and writes nothing', async () => {
    const { svc, upsert } = makeFake('off');
    const s = await runInchargeBillReview(svc, { month: '2026-09', now: OCT_5 });
    expect(s.skipped).toBe('off');
    expect(upsert).not.toHaveBeenCalled();
  });
});
