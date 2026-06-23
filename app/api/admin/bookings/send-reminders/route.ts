import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { bookableDates } from '@/lib/booking/window';

/**
 * Insert an in-app reminder for every transport learner who has NO booking for
 * tomorrow yet. Callable manually now; wire to a scheduler / pg_cron later so it
 * fires before the 18:00 IST cutoff. Idempotent per (learner, date) via the url
 * marker so re-running the same day doesn't duplicate.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface LearnerRow { id: string; profile_id: string | null }

async function sendReminders(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const date = bookableDates()[0]; // tomorrow
    const urlMarker = `/student/bookings?d=${date}`;
    const svc = createServiceRoleClient();

    // Transport learners with a route + a login profile.
    const { data: learners } = await svc
      .from('learners_profiles')
      .select('id, profile_id')
      .eq('bus_required', true)
      .not('transport_route_id', 'is', null)
      .not('profile_id', 'is', null);
    const all = (learners ?? []) as LearnerRow[];
    if (all.length === 0) return NextResponse.json({ success: true, data: { date, reminded: 0 } });

    // Who already booked tomorrow.
    const { data: booked } = await svc
      .from('tms_booking')
      .select('learner_id')
      .eq('travel_date', date)
      .eq('status', 'booked');
    const bookedIds = new Set<string>(((booked ?? []) as { learner_id: string }[]).map((b) => b.learner_id));

    // Who already got tomorrow's reminder (avoid dupes).
    const { data: existing } = await svc
      .from('notifications')
      .select('targeting')
      .eq('category', 'transport_booking')
      .eq('url', urlMarker);
    const notifiedProfiles = new Set<string>(
      ((existing ?? []) as { targeting: { user_id?: string } | null }[])
        .map((n) => n.targeting?.user_id)
        .filter((v): v is string => !!v)
    );

    const toInsert = all
      .filter((l) => !bookedIds.has(l.id) && l.profile_id && !notifiedProfiles.has(l.profile_id))
      .map((l) => ({
        title: 'Book tomorrow\'s bus',
        body: `Booking for ${date} closes at 6 PM today. Tap to reserve your seat.`,
        category: 'transport_booking',
        priority: 'normal',
        url: urlMarker,
        targeting: { type: 'user', user_id: l.profile_id },
        created_by: auth.userId,
      }));

    if (toInsert.length === 0) return NextResponse.json({ success: true, data: { date, reminded: 0 } });

    const ins = await svc.from('notifications').insert(toInsert);
    if (ins.error) {
      console.error('admin/bookings/send-reminders insert error:', ins.error);
      return NextResponse.json({ error: 'Failed to insert reminders' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { date, reminded: toInsert.length } });
  } catch (e) {
    console.error('admin/bookings/send-reminders error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => sendReminders(request, auth));
