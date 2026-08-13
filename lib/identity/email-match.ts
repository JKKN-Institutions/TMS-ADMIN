/**
 * Safe email matching for PostgREST `.ilike()` lookups.
 *
 * Email addresses are matched case-insensitively across this codebase because
 * `profiles.email` is NOT uniformly lowercase (6 rows differ), so a plain
 * `.eq()` on a lowercased value silently drops those people.
 *
 * But `.ilike()` takes a PATTERN, not a literal — and `_` is a single-character
 * wildcard. Real, measured consequence: `monisha_r@jkkn.ac.in` matched BOTH
 * `monisha_r@jkkn.ac.in` and `monisha.r@jkkn.ac.in`. 14 of 114 active bus
 * in-charge emails contain an underscore. The loud failure is a thrown
 * "multiple rows returned"; the DANGEROUS one is silent — when only the wrong
 * row exists, the lookup resolves to one row and the wrong person gets
 * warned, removed from their role, and billed.
 *
 * Escape the pattern instead of abandoning case-insensitivity.
 */
export function emailIlikePattern(email: string): string {
  // Backslash FIRST — escaping it after the others would double-escape them.
  return email.trim().replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}
