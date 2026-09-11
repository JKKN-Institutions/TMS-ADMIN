import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import {
  loadAttendanceWindows, readAttendanceWindows, validateWindows, LEG_NAME,
  type AttDirection, type AttendanceWindow, type AttendanceWindows,
} from '@/lib/boarding/attendance-window';
import { publishAttendanceSettingsChanged } from '@/lib/boarding/attendance-broadcast';

/**
 * Admin read/update of the attendance windows: the morning (onward) trip, and
 * the evening (return) trip with its on/off switch. Gated on .manage (stronger
 * than the scanner's .scan). Times are 'HH:MM'. The scan flow, the marking
 * endpoints and the boarding page read the same config via
 * loadAttendanceWindows. A save signals open boarding screens to re-read.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

interface WindowInput { start?: string; end?: string; enabled?: boolean; active?: boolean }

/** Shape-check one trip's input, filling missing fields from what is stored. */
function parseWindow(dir: AttDirection, w: WindowInput, stored: AttendanceWindow): AttendanceWindow | string {
  const start = String(w.start ?? stored.start);
  const end = String(w.end ?? stored.end);
  if (!HM.test(start) || !HM.test(end)) return `${LEG_NAME[dir]}: start/end must be HH:MM`;
  return {
    direction: dir,
    start,
    end,
    // A truthy non-boolean (e.g. the string "false") must not pass through:
    // it would be stored as a real `false` and quietly disable a leg.
    enabled: typeof w.enabled === 'boolean' ? w.enabled : stored.enabled,
    // Morning attendance is always on; only the evening has a switch.
    active: dir === 'onward' ? true : (typeof w.active === 'boolean' ? w.active : stored.active),
  };
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
    const parsedBody = await request.json().catch(() => null);
    const body = (parsedBody && typeof parsedBody === 'object' ? parsedBody : {}) as {
      onward?: WindowInput; return?: WindowInput;
    };
    const svc = createServiceRoleClient();
    // Use the null-on-error read, not loadAttendanceWindows: a read failure
    // must refuse the write, never fall back to defaults and overwrite the
    // real stored row (especially the untouched evening leg) with them.
    const stored = await readAttendanceWindows(svc);
    if (!stored) {
      return NextResponse.json(
        { error: 'Could not read the current attendance windows. Nothing was saved; try again.' },
        { status: 500 },
      );
    }

    const onward = parseWindow('onward', body.onward ?? {}, stored.onward);
    if (typeof onward === 'string') return NextResponse.json({ error: onward }, { status: 400 });

    // An older Settings screen sends no `return` key. Keep the stored evening
    // row exactly as it is, rather than reading the absence as "switch it off".
    const touchesEvening = !!body.return;
    const ret = touchesEvening ? parseWindow('return', body.return!, stored.return) : stored.return;
    if (typeof ret === 'string') return NextResponse.json({ error: ret }, { status: 400 });

    const windows: AttendanceWindows = { onward, return: ret };
    const invalid = validateWindows(windows);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const now = new Date().toISOString();
    // Only write the rows the caller actually touched. An old client that
    // never sends `return` must not rewrite the evening row's updated_at /
    // updated_by — it never touched it.
    const touched = touchesEvening ? [onward, ret] : [onward];
    const rows = touched.map((w) => ({
      direction: w.direction,
      start_time: w.start,
      end_time: w.end,
      enabled: w.enabled,
      is_active: w.active,
      updated_at: now,
      updated_by: auth.userId,
    }));
    const { error } = await svc.from('tms_attendance_window').upsert(rows, { onConflict: 'direction' });
    if (error) {
      console.error('admin attendance-windows PUT error:', error);
      return NextResponse.json({ error: 'Failed to save attendance windows' }, { status: 500 });
    }

    const leg = (w: AttendanceWindow) => `${w.start}-${w.end}${w.enabled ? '' : ' (not enforced)'}`;
    await logActivity(auth, request, {
      module: 'settings',
      action: 'update',
      entityType: 'tms_attendance_window',
      description:
        `Updated attendance windows — morning ${leg(onward)}; evening ${ret.active ? leg(ret) : 'off'}`,
      metadata: { windows },
    });

    // After the write has committed. A failed signal only delays open screens;
    // the server enforces the new times on the very next request regardless.
    await publishAttendanceSettingsChanged();

    return NextResponse.json({ success: true, data: { windows } });
  } catch (e) {
    console.error('admin attendance-windows PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getWindows(auth));
export const PUT = withAuth((req, auth) => putWindows(req, auth));
