import { describe, it, expect } from 'vitest';
import { resolveLearnerByProfile } from './requests';

/**
 * A minimal PostgREST-shaped fake for learners_profiles.
 *
 * The one behaviour that matters here: `.maybeSingle()` is NOT "return the first
 * row" — PostgREST asks for a single object and ERRORS (PGRST116) when the filter
 * matched more than one row. `profile_id` is not unique in learners_profiles, so
 * that error is reachable in production and this fake reproduces it faithfully.
 */
type Row = Record<string, unknown>;
type OrderSpec = { col: string; ascending: boolean; nullsFirst: boolean };

function rank(v: unknown): number | string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  return String(v);
}

function fakeSvc(rows: Row[]) {
  return {
    from() {
      let out = [...rows];
      const orders: OrderSpec[] = [];
      let cap = Infinity;

      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          out = out.filter((r) => r[col] === val);
          return builder;
        },
        order: (
          col: string,
          opts?: { ascending?: boolean; nullsFirst?: boolean },
        ) => {
          const ascending = opts?.ascending !== false;
          orders.push({ col, ascending, nullsFirst: opts?.nullsFirst ?? false });
          return builder;
        },
        limit: (n: number) => {
          cap = n;
          return builder;
        },
        maybeSingle: async () => {
          const sorted = [...out].sort((a, b) => {
            for (const o of orders) {
              const av = rank(a[o.col]);
              const bv = rank(b[o.col]);
              if (av === null && bv === null) continue;
              if (av === null) return o.nullsFirst ? -1 : 1;
              if (bv === null) return o.nullsFirst ? 1 : -1;
              if (av === bv) continue;
              const cmp = av < bv ? -1 : 1;
              return o.ascending ? cmp : -cmp;
            }
            return 0;
          });
          const page = sorted.slice(0, cap);
          if (page.length > 1) {
            return {
              data: null,
              error: {
                code: 'PGRST116',
                message: 'JSON object requested, multiple (or no) rows returned',
              },
            };
          }
          return { data: page[0] ?? null, error: null };
        },
      };
      return builder;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svcOf = (rows: Row[]) => fakeSvc(rows) as any;

const PROFILE = '0747d12e-4aff-4f7a-b630-1d9bfa3b5d3a';

const realRow: Row = {
  id: 'bbbb-real',
  profile_id: PROFILE,
  bus_required: true,
  lifecycle_status: 'active',
  transport_route_id: 'route-1',
  transport_stop_id: 'stop-1',
};

// The shadow: a stub 'approved' enquiry row carrying the SAME profile_id but no
// bus. Real data (saranyapmba2025@jkkn.ac.in) has exactly this shape.
const stubRow: Row = {
  id: 'aaaa-stub',
  profile_id: PROFILE,
  bus_required: false,
  lifecycle_status: 'approved',
  transport_route_id: null,
  transport_stop_id: null,
};

describe('resolveLearnerByProfile', () => {
  it('resolves the single row when profile_id is unique', async () => {
    const learner = await resolveLearnerByProfile(svcOf([realRow]), PROFILE);
    expect(learner?.id).toBe('bbbb-real');
    expect(learner?.busRequired).toBe(true);
  });

  it('returns null when the profile has no learner row', async () => {
    expect(await resolveLearnerByProfile(svcOf([]), PROFILE)).toBeNull();
  });

  it('picks the bus-carrying row when a stub row shadows it', async () => {
    // Stub listed first on purpose: an unordered read would surface it.
    const learner = await resolveLearnerByProfile(svcOf([stubRow, realRow]), PROFILE);
    expect(learner?.id).toBe('bbbb-real');
    expect(learner?.busRequired).toBe(true);
    expect(learner?.routeId).toBe('route-1');
  });

  it('ignores learner rows belonging to a different profile', async () => {
    const other: Row = { ...realRow, id: 'cccc-other', profile_id: 'someone-else' };
    const learner = await resolveLearnerByProfile(svcOf([other, stubRow]), PROFILE);
    expect(learner?.id).toBe('aaaa-stub');
  });
});
