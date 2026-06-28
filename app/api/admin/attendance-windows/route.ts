import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadAttendanceWindows, hmToMinutes, type AttDirection } from '@/lib/boarding/attendance-window';

/**
 * Admin read/update of the attendance scan windows (onward/return start/end +
 * enable). Gated on .manage (stronger than the scanner's .scan). Persists both
 * directions in one PUT; times are 'HH:MM'. The scan flow + scan page read these
 * via loadAttendanceWindows / the boarding GET endpoint.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const HM = /^\d{2}:\d{2}$/;

interface WindowInput { start?: string; end?: string; enabled?: boolean }

function validate(dir: AttDirection, w: WindowInput): { start: string; end: string; enabled: boolean } | string {
  const start = String(w.start ?? '');
  const end = String(w.end ?? '');
  if (!HM.test(start) || !HM.test(end)) return `${dir}: start/end must be HH:MM`;
  if (hmToMinutes(start) >= hmToMinutes(end)) return `${dir}: start time must be before end time`;
  return { start, end, enabled: w.enabled !== false };
}

async function getWindows(auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();
    const windows = await loadAttendanceWindows(svc);
    return NextResponse.json({ success: true, data: { windows } });
  } catch (e) {
    console.error('admin attendance-windows GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function putWindows(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { onward?: WindowInput; return?: WindowInput };
    const onward = validate('onward', body.onward ?? {});
    if (typeof onward === 'string') return NextResponse.json({ error: onward }, { status: 400 });
    const ret = validate('return', body.return ?? {});
    if (typeof ret === 'string') return NextResponse.json({ error: ret }, { status: 400 });

    const svc = createServiceRoleClient();
    const now = new Date().toISOString();
    const rows = [
      { direction: 'onward', start_time: onward.start, end_time: onward.end, enabled: onward.enabled, updated_at: now, updated_by: auth.userId },
      { direction: 'return', start_time: ret.start, end_time: ret.end, enabled: ret.enabled, updated_at: now, updated_by: auth.userId },
    ];
    const { error } = await svc.from('tms_attendance_window').upsert(rows, { onConflict: 'direction' });
    if (error) {
      console.error('admin attendance-windows PUT error:', error);
      return NextResponse.json({ error: 'Failed to save attendance windows' }, { status: 500 });
    }

    await logActivity(auth, request, {
      module: 'settings',
      action: 'update',
      entityType: 'tms_attendance_window',
      description: `Updated attendance scan windows — onward ${onward.start}-${onward.end}${onward.enabled ? '' : ' (off)'}, return ${ret.start}-${ret.end}${ret.enabled ? '' : ' (off)'}`,
      metadata: { onward, return: ret },
    });

    return NextResponse.json({ success: true, data: { windows: { onward: { direction: 'onward', ...onward }, return: { direction: 'return', ...ret } } } });
  } catch (e) {
    console.error('admin attendance-windows PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getWindows(auth));
export const PUT = withAuth((req, auth) => putWindows(req, auth));
