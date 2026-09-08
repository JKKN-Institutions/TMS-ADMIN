// lib/fees/bill-academic-year.ts
// Which academic year a TRANSPORT bill belongs to.
//
// A bill's academic_year_id used to be copied straight off
// learners_profiles.academic_year_id. That is the learner's OWN academic year,
// and it lags: a profile that has not been rolled over yet still reads
// 2025-2026 while the transport year being billed is 2026-2027. The bill then
// carried — and displayed — the wrong year even though its transport_year_id
// was right.
//
// The transport year is the authority. Academic years are per-institution rows
// that share the transport year's naming ('2026-2027'), so we resolve
// institution -> the academic year of the SAME NAME and stamp that. The
// learner's profile value is kept only as a last-resort fallback, for an
// institution that has no row for this year yet.

export interface AcademicYearLite {
  id: string;
  institution_id: string | null;
  academic_year_name: string | null;
}

/**
 * institution_id -> academic_years.id for the rows named `transportYearName`.
 *
 * Rows with no institution, a different name, or a missing name are ignored.
 * The first row wins for a given institution: duplicates ('2026-2027' appearing
 * twice for one institution) are a data defect, and silently preferring one is
 * better than throwing mid-generation — the value is a label, not money.
 */
export function academicYearByInstitution(
  rows: AcademicYearLite[],
  transportYearName: string | null | undefined
): Map<string, string> {
  const out = new Map<string, string>();
  if (!transportYearName) return out;
  for (const r of rows) {
    if (!r.institution_id) continue;
    if (r.academic_year_name !== transportYearName) continue;
    if (!out.has(r.institution_id)) out.set(r.institution_id, r.id);
  }
  return out;
}

/**
 * The academic_year_id to stamp on a bill: the transport year's academic year
 * for this learner's institution, else the learner's own (possibly stale) one,
 * else null.
 */
export function resolveBillAcademicYear(
  byInstitution: Map<string, string>,
  institutionId: string | null | undefined,
  profileAcademicYearId: string | null | undefined
): string | null {
  if (institutionId) {
    const hit = byInstitution.get(institutionId);
    if (hit) return hit;
  }
  return profileAcademicYearId ?? null;
}
