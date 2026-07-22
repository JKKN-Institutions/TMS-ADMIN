import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadAttendanceWindows, hmToMinutes, type AttDirection } from '@/lib/boarding/attendance-window';

/**
 * Admin read/update of the attendance scan window (onward/morning start/end +
 * enable). Gated on .manage (stronger than the scanner's .scan). Persists the
 * onward window in one PUT; times are 'HH:MM'. The scan flow + scan page read
 * this via loadAttendanceWindows / the boarding GET endpoint.
 *
 * A stored `direction='return'` row may still exist in `tms_attendance_window`
 * from before the evening leg was retired — it is retained for history and is
 * never read or deleted here, only ignored.
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
    // A `return` key in the body is ignored, not rejected — an old client
    // still sending the evening window shouldn't 400 on a config write.
    const body = (await request.json().catch(() => ({}))) as { onward?: WindowInput; return?: WindowInput };
    const onward = validate('onward', body.onward ?? {});
    if (typeof onward === 'string') return NextResponse.json({ error: onward }, { status: 400 });

    const svc = createServiceRoleClient();
    const now = new Date().toISOString();
    const rows = [
      { direction: 'onward', start_time: onward.start, end_time: onward.end, enabled: onward.enabled, updated_at: now, updated_by: auth.userId },
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
      description: `Updated attendance scan window — onward ${onward.start}-${onward.end}${onward.enabled ? '' : ' (off)'}`,
      metadata: { onward },
    });

    return NextResponse.json({ success: true, data: { windows: { onward: { direction: 'onward', ...onward } } } });
  } catch (e) {
    console.error('admin attendance-windows PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getWindows(auth));
export const PUT = withAuth((req, auth) => putWindows(req, auth));
