import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadAttendanceWindows, activeDirection, istMinutesOfDay } from '@/lib/boarding/attendance-window';

/**
 * GET the configured attendance scan windows + the server-computed active
 * direction. The scan page uses this to seed its auto-tab from a trusted clock
 * (the device clock may be wrong) and to know which direction to enable.
 * Gated on .scan — the same boundary the scanner itself uses.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function getWindows(auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();
    const windows = await loadAttendanceWindows(svc);
    return NextResponse.json({
      success: true,
      data: { windows, activeDirection: activeDirection(windows), serverNowMinutes: istMinutesOfDay() },
    });
  } catch (e) {
    console.error('boarding attendance-window GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getWindows(auth));
