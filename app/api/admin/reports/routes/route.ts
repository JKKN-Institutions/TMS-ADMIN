import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday } from '@/lib/booking/window';
import { parseReportParams } from '@/lib/reports/params';
import { fetchRouteSummary } from '@/lib/reports/rpc';
import { routeSheetRows, reportFileName } from '@/lib/reports/sheets';
import { xlsxResponse } from '@/lib/reports/workbook';

/**
 * GET /api/admin/reports/routes — per-bus roll-up over a date range.
 * One row per bus, so it is never paginated. `format=xlsx` downloads it.
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
    const rows = await fetchRouteSummary(svc, params);

    if (params.format === 'xlsx') {
      if (!(await requirePerm(auth, TMS_PERMISSIONS.REPORTS_EXPORT))) {
        return NextResponse.json({ error: 'You may view this report but not export it' }, { status: 403 });
      }
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Nothing to export for those filters' }, { status: 404 });
      }
      return xlsxResponse(
        'Buses',
        routeSheetRows(rows),
        reportFileName('transport-buses', params.from, params.to),
      );
    }

    return NextResponse.json({
      success: true,
      data: { rows, range: { from: params.from, to: params.to, direction: params.direction } },
    });
  } catch (e) {
    console.error('admin reports routes error:', e);
    return NextResponse.json({ error: 'Failed to build the report' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => report(request, auth));
