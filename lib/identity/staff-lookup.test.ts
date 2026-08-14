import { describe, expect, it } from 'vitest';
import { resolveStaffId } from './staff-lookup';

type Result = { data: unknown; error: unknown };

/**
 * Records which columns were queried, so a test can assert the ORDER of the
 * fallbacks rather than only the final answer — the order is the whole point.
 */
function makeSvc(byColumn: Record<string, Result>) {
  const asked: string[] = [];
  const svc = {
    from: () => {
      let column = '';
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string) => {
          column = col;
          return builder;
        },
        ilike: (col: string) => {
          column = col;
          return builder;
        },
        maybeSingle: () => {
          asked.push(column);
          return Promise.resolve(byColumn[column] ?? { data: null, error: null });
        },
      };
      return builder;
    },
  };
  return { svc: svc as never, asked };
}

const HIT = { data: { id: 'staff-1' }, error: null };
const MISS = { data: null, error: null };

describe('resolveStaffId', () => {
  it('prefers profile_id — the only link that is not a string comparison', async () => {
    const { svc, asked } = makeSvc({ profile_id: HIT });
    expect(await resolveStaffId(svc, { email: 'a@b.com', profileId: 'p-1' })).toBe('staff-1');
    // Stops at the first hit: no string matching is attempted at all.
    expect(asked).toEqual(['profile_id']);
  });

  it('falls back to the personal email when there is no profile link', async () => {
    const { svc, asked } = makeSvc({ email: HIT });
    expect(await resolveStaffId(svc, { email: 'a@b.com', profileId: 'p-1' })).toBe('staff-1');
    expect(asked).toEqual(['profile_id', 'email']);
  });

  it('falls back to institution_email last', async () => {
    const { svc, asked } = makeSvc({ institution_email: HIT });
    expect(await resolveStaffId(svc, { email: 'a@b.com', profileId: 'p-1' })).toBe('staff-1');
    expect(asked).toEqual(['profile_id', 'email', 'institution_email']);
  });

  it('skips the profile_id probe entirely when no profile is known', async () => {
    // Passing a null profileId as a filter value would match every staff row
    // whose profile_id is null, so the probe must not run at all.
    const { svc, asked } = makeSvc({ email: HIT });
    expect(await resolveStaffId(svc, { email: 'a@b.com', profileId: null })).toBe('staff-1');
    expect(asked).toEqual(['email']);
  });

  it('returns null when no strategy resolves', async () => {
    const { svc } = makeSvc({});
    expect(await resolveStaffId(svc, { email: 'a@b.com', profileId: 'p-1' })).toBeNull();
  });

  it('returns null rather than a guess when a lookup errors', async () => {
    // An ambiguous match throws "multiple rows returned" here. Continuing to
    // the next strategy would answer a question the data says is unanswerable,
    // and this answer revokes a role and raises a bill.
    const { svc, asked } = makeSvc({
      profile_id: { data: null, error: { message: 'multiple rows returned' } },
    });
    expect(await resolveStaffId(svc, { email: 'a@b.com', profileId: 'p-1' })).toBeNull();
    expect(asked).toEqual(['profile_id']);
  });

  it('escapes email wildcards so underscores cannot match the wrong person', async () => {
    // monisha_r@ must not also match monisha.r@ — see lib/identity/email-match.
    const patterns: string[] = [];
    const svc = {
      from: () => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          ilike: (_col: string, pattern: string) => {
            patterns.push(pattern);
            return builder;
          },
          maybeSingle: () => Promise.resolve(MISS),
        };
        return builder;
      },
    };
    await resolveStaffId(svc as never, { email: 'monisha_r@jkkn.ac.in', profileId: null });
    expect(patterns.every((p) => p.includes('\\_'))).toBe(true);
  });
});
