import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { sendBookingReminders } from '@/lib/booking/reminders';

/**
 * Manual "send now" for the daily booking reminder. The scheduled path is
 * /api/cron/booking-reminders; both delegate to lib/booking/reminders.ts so the
 * targeting and idempotency rules can never drift between them.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handler(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
    const summary = await sendBookingReminders(createServiceRoleClient(), {
      createdBy: auth.userId,
      dryRun,
    });
    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    console.error('admin/bookings/send-reminders error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handler(request, auth));
