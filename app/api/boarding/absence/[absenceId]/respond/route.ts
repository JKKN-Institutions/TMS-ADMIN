/**
 * Accept or decline a cover request.
 *
 * Only an ACCEPTED cover transfers duty. Declining leaves the absentee excused
 * and the share unmarked — responsibility is never forced onto someone who did
 * not agree to it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyProfile } from '@/lib/notifications/notify';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { istToday } from '@/lib/booking/window';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function respond(
  request: NextRequest,
  auth: AuthContext,
  absenceId: string,
) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { accept?: boolean };
    if (typeof body.accept !== 'boolean') {
      return NextResponse.json({ error: 'accept must be true or false' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const { data: absence, error: absenceError } = await svc
      .from('tms_incharge_absence')
      .select('id, staff_email, covering_assignment_id, absence_date, cover_status')
      .eq('id', absenceId)
      .maybeSingle();
    if (absenceError) {
      console.error('absence respond: absence lookup error:', absenceError);
      return NextResponse.json({ error: 'Failed to load the absence' }, { status: 500 });
    }
    if (!absence) return NextResponse.json({ error: 'Absence not found' }, { status: 404 });

    const { data: prof, error: profError } = await auth.supabase.from('profiles').select('email').eq('id', auth.userId).maybeSingle();
    if (profError) {
      console.error('absence respond: caller profile lookup error:', profError);
      return NextResponse.json({ error: 'Failed to load your profile' }, { status: 500 });
    }
    const email = (prof?.email as string | undefined)?.toLowerCase();
    if (!email) return NextResponse.json({ error: 'Your profile has no email' }, { status: 400 });

    // Only the nominated colleague may answer. Anyone else answering would be
    // taking on — or refusing — a duty that was never offered to them. A real
    // query error must not collapse into "not addressed to you" — that tells
    // someone they lack authority they actually have.
    const { data: coverAssignment, error: coverError } = absence.covering_assignment_id
      ? await svc.from('tms_staff_route_assignment').select('staff_email').eq('id', absence.covering_assignment_id).maybeSingle()
      : { data: null, error: null };
    if (coverError) {
      console.error('absence respond: cover assignment lookup error:', coverError);
      return NextResponse.json({ error: 'Failed to verify the cover request' }, { status: 500 });
    }
    const nominatedEmail = (coverAssignment as { staff_email: string } | null)?.staff_email?.toLowerCase() ?? null;
    if (!nominatedEmail || nominatedEmail !== email) {
      return NextResponse.json({ error: 'This cover request was not addressed to you' }, { status: 403 });
    }

    // Cover cannot be ACCEPTED for a day that has already gone. Accepting
    // retroactively adds the absentee's share to this coverer's duty for days
    // they can no longer mark -- the marking window on a past date is shut --
    // so a late "yes" would fail the coverer's month for the act of agreeing to
    // help. A DECLINE of a past request stays allowed: declining changes
    // nothing retroactively, and leaving stale requests unanswerable would trap
    // them in the nominee's inbox forever.
    if (body.accept && absence.absence_date < istToday()) {
      return NextResponse.json({
        error: 'That day has already passed, so cover can no longer be accepted for it. You can still decline the request.',
        reason: 'absence_date_past',
      }, { status: 400 });
    }

    const { error } = await svc
      .from('tms_incharge_absence')
      .update({
        cover_status: body.accept ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', absenceId);
    if (error) {
      console.error('absence respond error:', error);
      return NextResponse.json({ error: 'Failed to record your response' }, { status: 500 });
    }

    const { data: absenteeProfile } = await svc
      .from('profiles').select('id').ilike('email', emailIlikePattern(absence.staff_email)).maybeSingle();
    const absenteeId = (absenteeProfile as { id: string } | null)?.id;
    if (absenteeId) {
      await notifyProfile(svc, {
        profileId: absenteeId,
        actorId: auth.userId,
        title: body.accept ? 'Your cover request was accepted' : 'Your cover request was declined',
        body: body.accept
          ? `A colleague will mark your students on ${absence.absence_date}.`
          : `Nobody has accepted cover for ${absence.absence_date}. You are still excused for that day, but your students will go unmarked.`,
        url: '/boarding/in-charge',
      });
    }

    return NextResponse.json({ success: true, data: { cover_status: body.accept ? 'accepted' : 'declined' } });
  } catch (e) {
    console.error('boarding absence respond error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth(async (request, auth) => {
  // Next 15 hands params as a Promise; read the id off the URL instead so the
  // handler keeps the plain withAuth signature the rest of the module uses.
  const segments = new URL(request.url).pathname.split('/');
  const absenceId = segments[segments.indexOf('absence') + 1] ?? '';
  if (!absenceId) return NextResponse.json({ error: 'absenceId is required' }, { status: 400 });
  return respond(request, auth, absenceId);
});
