import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday } from '@/lib/booking/window';
import { parseReportParams, MAX_EXPORT_ROWS } from '@/lib/reports/params';
import { fetchAllLearnerRows, fetchLearnerRows } from '@/lib/reports/rpc';
import { learnerSheetRows, reportFileName } from '@/lib/reports/sheets';
import { xlsxResponse } from '@/lib/reports/workbook';

/**
 * GET /api/admin/reports/learners — one row per learner per service day, with
 * booking, attendance and (current) fee state.
 *
 * Paginated on the SERVER: the whole point of this report is ranges no browser
 * should hold. `format=xlsx` returns every row the filters match instead of a
 * page, so an export is what you filtered rather than what happened to load.
 *
 * tms.reports.view to read; tms.reports.export to download.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function report(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.REPORTS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = parseReportParams(new URL(request.url).searchParams, istToday());
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const params = parsed.params;

    const svc = createServiceRoleClient();

    if (params.format === 'xlsx') {
      // Downloading is its own permission, and until now nothing checked it.
      if (!(await requirePerm(auth, TMS_PERMISSIONS.REPORTS_EXPORT))) {
        return NextResponse.json({ error: 'You may view this report but not export it' }, { status: 403 });
      }
      const all = await fetchAllLearnerRows(svc, params, MAX_EXPORT_ROWS);
      if (all.rows.length === 0) {
        return NextResponse.json({ error: 'Nothing to export for those filters' }, { status: 404 });
      }
      return xlsxResponse(
        'Learners',
        learnerSheetRows(all.rows),
        reportFileName('transport-learners', params.from, params.to),
      );
    }

    const { rows, total } = await fetchLearnerRows(svc, params, { limit: params.limit, offset: params.offset });
    return NextResponse.json({
      success: true,
      data: {
        rows,
        total,
        limit: params.limit,
        offset: params.offset,
        range: { from: params.from, to: params.to, direction: params.direction },
      },
    });
  } catch (e) {
    console.error('admin reports learners error:', e);
    return NextResponse.json({ error: 'Failed to build the report' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => report(request, auth));
