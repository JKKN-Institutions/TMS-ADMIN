/**
 * Attendance rows written by the database when a trip's window closes
 * (public.tms_auto_close_attendance, run by pg_cron). They record "nobody
 * marked this rider before attendance closed", so they are real absences for
 * turnout, but they are NOT staff work: never count them as "marked" when
 * judging an in-charge's progress.
 */
export const AUTO_METHOD = 'auto' as const;

export const AUTO_MARK_TITLE = 'Marked absent automatically — not marked before attendance closed';

/** The migration that defines the job; a test pins its roster to the app's. */
export const AUTO_ABSENT_MIGRATION = 'supabase/migrations/20260915120000_tms_attendance_auto_absent.sql';

export function isAutoMark(method: string | null | undefined): boolean {
  return method === AUTO_METHOD;
}
