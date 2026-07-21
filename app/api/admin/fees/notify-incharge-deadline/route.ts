import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { notifyProfile } from '@/lib/notifications/notify';
import { logActivity } from '@/lib/activity/log';

const DEADLINE_LABEL = '25 July 2026';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/**
 * One-shot notice to every bus-using staff member: volunteer as bus in-charge
 * by the deadline, or the stop-wise transport fee applies.
 *
 * Deliberately a manual admin action, not a cron: it is sent once (plus a
 * reminder), and an accidental re-fire spams 105 real people.
 */
async function notify(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const supabase = createServiceRoleClient();

    const { data: staffRows, error: staffErr } = await supabase
      .from('staff')
      .select('id, email, profile_id')
      .eq('bus_required', true)
      .eq('is_active', true);
    if (staffErr) {
      return NextResponse.json({ error: 'Failed to load bus staff.' }, { status: 500 });
    }

    const { data: assignRows, error: assignErr } = await supabase
      .from('tms_staff_route_assignment')
      .select('staff_email')
      .eq('is_active', true);
    if (assignErr) {
      return NextResponse.json({ error: 'Failed to load in-charge assignments.' }, { status: 500 });
    }
    const already = new Set(
      ((assignRows ?? []) as Array<{ staff_email: string | null }>)
        .map((r) => String(r.staff_email ?? '').trim().toLowerCase())
        .filter(Boolean)
    );

    const title = 'Bus in-charge — action needed';
    const body =
      `Volunteer as a bus in-charge by ${DEADLINE_LABEL} to keep your transport fee exemption. ` +
      `If you have not taken the role by then, transport fees for 2026-2027 will apply, ` +
      `based on your boarding stop.`;

    let notified = 0;
    let skipped = 0;
    for (const s of (staffRows ?? []) as Array<{ id: string; email: string | null; profile_id: string | null }>) {
      const em = String(s.email ?? '').trim().toLowerCase();
      // Existing in-charges already hold the exemption — do not tell them to act.
      if (em && already.has(em)) { skipped++; continue; }
      if (!s.profile_id) { skipped++; continue; }
      await notifyProfile(supabase, {
        profileId: s.profile_id,
        actorId: auth.userId,
        title,
        body,
        category: 'general',
        url: '/boarding/in-charge',
      });
      notified++;
    }

    await logActivity(auth, request, {
      module: 'fees',
      action: 'update',
      entityType: 'tms_fee_structure',
      entityId: null,
      entityLabel: 'Bus in-charge deadline notice',
      description: `Notified ${notified} bus staff of the ${DEADLINE_LABEL} in-charge deadline; ${skipped} skipped`,
      metadata: { notified, skipped, deadline: DEADLINE_LABEL },
    });

    return NextResponse.json({
      success: true,
      data: { notified, skipped },
      message: `Notified ${notified} staff; ${skipped} skipped (already in-charge or no login).`,
    });
  } catch (e) {
    console.error('In-charge deadline notice error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => notify(request, auth));
