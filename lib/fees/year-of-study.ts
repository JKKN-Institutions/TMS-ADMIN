// lib/fees/year-of-study.ts
// Year-of-study derivation for tiered fee structures.
//
// A learner has no stored "year of study". We derive it from their ADMISSION
// YEAR relative to the structure's transport year:
//
//   yearOfStudy = currentYear - admissionYear + 1
//
// where currentYear is the calendar year the transport year starts in
// (2026-2027 -> 2026, from tms_transport_year.start_date) and admissionYear is
// admission_years.year (an integer, e.g. 2024). A learner admitted in 2024 is in
// their 3rd year during 2026-2027. A missing admission year yields null — the
// caller treats that learner as "unresolved" (skipped + reported), never guessed.

export interface YearBandLite {
  study_years: number[];
}

/** Calendar year a transport year starts in, from its start_date ('2026-05-01' -> 2026). */
export function currentYearOf(startDate: string | null | undefined): number | null {
  if (!startDate) return null;
  const y = Number(String(startDate).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/** Derived year of study, or null when either input is unknown. */
export function deriveStudyYear(
  currentYear: number | null,
  admissionYear: number | null
): number | null {
  if (currentYear == null || admissionYear == null) return null;
  return currentYear - admissionYear + 1;
}

/** The first band whose study_years contains `year`, or null (no match / unknown year). */
export function bandForYear<T extends YearBandLite>(bands: T[], year: number | null): T | null {
  if (year == null) return null;
  return bands.find((b) => b.study_years.includes(year)) ?? null;
}
