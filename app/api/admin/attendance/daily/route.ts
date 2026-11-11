import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday } from '@/lib/booking/window';
import {
  buildDailyReport, shiftDate, DAILY_LOOKBACK_DAYS,
  type DailyReport, type RawDailyRoute,
} from '@/lib/attendance/daily-report';
import { hmToMinutes, istMinutesOfDay, readAttendanceWindows } from '@/lib/boarding/attendance-window';
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DailyReportResponse extends DailyReport {
  direction: 'onward' | 'return';
  today: string;
  /**
   * Today's marking window for this trip has not ended: absences are not
   * written yet, so "not marked" is still expected to fall. null end = unknown.
   */
  windowOpen: boolean;
  windowEnd: string | null;
  /** Names of the in-charges of each bus that was not scanned, by route id. */
  inchargeNames: Record<string, string[]>;
}

/**
 * GET /api/admin/attendance/daily?date=YYYY-MM-DD&direction=onward|return
 *
 * One day, one trip, every bus: learners, present, absent, who scanned, and the
 * short list of buses to act on. One RPC call reads a five-week look-back (one
 * row per route), which also yields the last-7-days strip and the "not marked
 * since" streaks.
 */
async function getDaily(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const today = istToday();
    const date = url.searchParams.get('date') || today;
    if (!ISO_DATE.test(date) || shiftDate(date, 0) !== date) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    if (date > today) {
      return NextResponse.json({ error: 'Choose today or an earlier day' }, { status: 400 });
    }
    const direction = url.searchParams.get('direction') === 'return' ? 'return' : 'onward';

    const svc = createServiceRoleClient();
    const { data, error } = await svc.rpc('tms_attendance_daily_report', {
      p_from: shiftDate(date, -DAILY_LOOKBACK_DAYS), p_to: date, p_direction: direction,
    });
    if (error) {
      // Never an empty report: that would read as "no bus was marked".
      console.error('admin attendance daily error:', error);
      return NextResponse.json({ error: 'Failed to load the daily report' }, { status: 500 });
    }

    const report = buildDailyReport((data ?? []) as RawDailyRoute[], date);

    // Is today's window for this trip still running? Display only, fail-soft.
    let windowOpen = false;
    let windowEnd: string | null = null;
    if (date === today) {
      const windows = await readAttendanceWindows(svc);
      const win = windows?.[direction];
      if (win && win.enabled) {
        windowEnd = win.end;
        windowOpen = istMinutesOfDay() < hmToMinutes(win.end);
      }
    }

    // Who to speak to, for the buses that have in-charges but were not scanned.
    // A failed name lookup leaves the list empty; it never fails the report.
    const inchargeNames: Record<string, string[]> = {};
    await Promise.all(
      report.actions.notScanned.map(async (r) => {
        try {
          inchargeNames[r.routeId] = (await getBoardingStaffForRoute(svc, r.routeId)).map((s) => s.name);
        } catch (e) {
          console.error('admin attendance daily: in-charge lookup failed (non-fatal):', e);
        }
      }),
    );

    const body: DailyReportResponse = { ...report, direction, today, windowOpen, windowEnd, inchargeNames };
    return NextResponse.json({ success: true, data: body });
  } catch (e) {
    console.error('admin attendance daily error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getDaily(request, auth));
