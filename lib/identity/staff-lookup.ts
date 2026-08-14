/**
 * Resolve the `staff` row for a person known only by their assignment email.
 *
 * Staff carry THREE addresses (see the staff-triple-email note): `staff.email`
 * is the PERSONAL one, `staff.institution_email` the institutional one, and
 * `profiles.email` the identity authority that logins key on. A bus in-charge
 * assignment stores whichever address the admin typed, so matching on any
 * single column silently loses people.
 *
 * Measured on the live data: of 114 active in-charge assignments, only 80
 * resolve via `staff.email`. The other 34 resolve ONLY via `institution_email`
 * or `profile_id`. The in-charge enforcement cron matched `staff.email` alone,
 * so for 30% of in-charges its billing probe returned "no fee structure" and
 * quietly declined to remove or bill them — a gate that looked like a data gap
 * and was in fact a lookup bug.
 *
 * All three strategies were verified to resolve uniquely across the full
 * population: zero unresolvable, zero ambiguous.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailIlikePattern } from './email-match';

/**
 * Returns the staff id, or null when the person genuinely cannot be resolved.
 *
 * Ordered strongest link first: `profile_id` is a uuid, so it cannot suffer the
 * wildcard and case problems that make the email columns hazardous. The email
 * fallbacks are escaped patterns, never raw values.
 *
 * A lookup ERROR aborts and returns null instead of trying the next strategy.
 * The error that matters here is "multiple rows returned" — an ambiguous match.
 * Falling through would replace a known ambiguity with a confident wrong answer,
 * and the caller uses this to revoke a role and raise a bill.
 */
export async function resolveStaffId(
  svc: SupabaseClient,
  opts: { email: string; profileId: string | null },
): Promise<string | null> {
  // A null profileId as a filter value would match every staff row whose
  // profile_id is null, so this probe is skipped rather than run with null.
  if (opts.profileId) {
    const { data, error } = await svc
      .from('staff')
      .select('id')
      .eq('profile_id', opts.profileId)
      .maybeSingle();
    if (error) return null;
    if (data?.id) return data.id as string;
  }

  const pattern = emailIlikePattern(opts.email);

  for (const column of ['email', 'institution_email'] as const) {
    const { data, error } = await svc
      .from('staff')
      .select('id')
      .ilike(column, pattern)
      .maybeSingle();
    if (error) return null;
    if (data?.id) return data.id as string;
  }

  return null;
}
