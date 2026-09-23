/**
 * SERVER ONLY. The three report reads, in one place.
 *
 * Each maps a parsed ReportParams onto the matching SQL function; filters reach
 * the database as typed parameters, never as interpolated text, and the
 * database does the filtering and the counting (see the migration header for
 * the measurements that decided that).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportParams } from './params';
import type { GroupSummaryRow, LearnerReportRow, RouteSummaryRow } from './types';

/** Rows to pull per call when exporting everything a filter matches. */
export const EXPORT_CHUNK = 2_000;

export async function fetchLearnerRows(
  svc: SupabaseClient,
  p: ReportParams,
  page: { limit: number; offset: number },
): Promise<{ rows: LearnerReportRow[]; total: number }> {
  const { data, error } = await svc.rpc('tms_report_learner_rows', {
    p_from: p.from,
    p_to: p.to,
    p_direction: p.direction,
    p_route_ids: p.routeIds,
    p_institution_ids: p.institutionIds,
    p_department_ids: p.departmentIds,
    p_booked: p.booked,
    p_attendance: p.attendance,
    p_fee: p.fee,
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) throw error;
  const rows = (data ?? []) as LearnerReportRow[];
  // The window count rides on every row; an empty page means an empty report.
  return { rows, total: rows.length ? Number(rows[0].total_rows) : 0 };
}

/** Every row a filter matches, in chunks, for the export. */
export async function fetchAllLearnerRows(
  svc: SupabaseClient,
  p: ReportParams,
  max: number,
): Promise<{ rows: LearnerReportRow[]; total: number; truncated: boolean }> {
  const out: LearnerReportRow[] = [];
  let total = 0;
  for (let offset = 0; offset < max; offset += EXPORT_CHUNK) {
    const limit = Math.min(EXPORT_CHUNK, max - offset);
    const page = await fetchLearnerRows(svc, p, { limit, offset });
    total = page.total;
    out.push(...page.rows);
    if (page.rows.length < limit) break;
  }
  return { rows: out, total, truncated: total > out.length };
}

export async function fetchRouteSummary(svc: SupabaseClient, p: ReportParams): Promise<RouteSummaryRow[]> {
  const { data, error } = await svc.rpc('tms_report_route_summary', {
    p_from: p.from,
    p_to: p.to,
    p_direction: p.direction,
    p_route_ids: p.routeIds,
    p_institution_ids: p.institutionIds,
    p_department_ids: p.departmentIds,
  });
  if (error) throw error;
  return (data ?? []) as RouteSummaryRow[];
}

export async function fetchGroupSummary(svc: SupabaseClient, p: ReportParams): Promise<GroupSummaryRow[]> {
  const { data, error } = await svc.rpc('tms_report_institution_summary', {
    p_from: p.from,
    p_to: p.to,
    p_direction: p.direction,
    p_group: p.group,
    p_route_ids: p.routeIds,
    p_institution_ids: p.institutionIds,
    p_department_ids: p.departmentIds,
  });
  if (error) throw error;
  return (data ?? []) as GroupSummaryRow[];
}
