/**
 * In-charge absence declarations and cover handover.
 *
 * A declared absence excuses the in-charge for that date. Nominating a
 * colleague creates a PENDING cover request; only when that colleague accepts
 * does the duty — and the right to mark the share — transfer for that date.
 *
 * Gated on tms.attendance.scan: declaring you will not be on the bus is a
 * weaker act than marking attendance, and every in-charge already holds .scan.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAssignedRouteIdsForUser } from '@/lib/boarding/identity';
import { getBoardingStaffForRoute } from '@/lib/routes/boarding-staff';
import { notifyProfile } from '@/lib/notifications/notify';
import { emailIlikePattern } from '@/lib/identity/email-match';
import { istToday } from '@/lib/booking/window';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

// Throws on a real query error (caught by each caller's try/catch → 500).
// Returns null only for the genuine "no email on this profile" case, which
// callers treat as a business state, not a failure.
async function callerEmailOf(auth: AuthContext): Promise<string | null> {
  const { data, error } = await auth.supabase.from('profiles').select('email').eq('id', auth.userId).maybeSingle();
  if (error) throw new Error(`callerEmailOf query failed: ${error.message}`);
  return (data?.email as string | undefined)?.toLowerCase() ?? null;
}

interface AbsenceDbRow {
  id: string; assignment_id: string; staff_email: string; route_id: string;
  absence_date: string; reason: string | null;
  covering_assignment_id: string | null; cover_status: string;
}

/**
 * Decorate raw rows with route numbers and staff display names.
 *
 * Both lookups here throw on a real query error rather than falling back to
 * the raw id: this data feeds directly into what an in-charge reads as "who
 * covers me" / "which route", so a silent fallback could show a wrong-looking
 * but plausible id instead of surfacing the failure. Callers' try/catch turns
 * the throw into a 500. This is stricter than the name-resolution fallback
 * below (nameByEmail), which is allowed to degrade to the raw email because
 * getBoardingStaffForRoute already treats an unresolved name as normal, not
 * an error.
 */
async function decorate(svc: ReturnType<typeof createServiceRoleClient>, rows: AbsenceDbRow[]) {
  if (rows.length === 0) return [];
  const routeIds = [...new Set(rows.map((r) => r.route_id))];
  const { data: routes, error: routesError } = await svc.from('tms_route').select('id, route_number').in('id', routeIds);
  if (routesError) throw new Error(`decorate: route lookup failed: ${routesError.message}`);
  const numById = new Map(((routes ?? []) as { id: string; route_number: string | null }[]).map((r) => [r.id, r.route_number]));

  const coveringIds = [...new Set(rows.map((r) => r.covering_assignment_id).filter(Boolean))] as string[];
  const emailByAssignment = new Map<string, string>();
  if (coveringIds.length) {
    const { data, error: coverError } = await svc.from('tms_staff_route_assignment').select('id, staff_email').in('id', coveringIds);
    if (coverError) throw new Error(`decorate: covering-assignment lookup failed: ${coverError.message}`);
    for (const a of (data ?? []) as { id: string; staff_email: string }[]) emailByAssignment.set(a.id, a.staff_email.toLowerCase());
  }

  const nameByEmail = new Map<string, string>();
  for (const routeId of routeIds) {
    for (const s of await getBoardingStaffForRoute(svc, routeId)) nameByEmail.set(s.email, s.name);
  }

  return rows.map((r) => {
    const coveringEmail = r.covering_assignment_id ? emailByAssignment.get(r.covering_assignment_id) ?? null : null;
    return {
      id: r.id,
      route_id: r.route_id,
      route_number: numById.get(r.route_id) ?? null,
      absence_date: r.absence_date,
      reason: r.reason,
      cover_status: r.cover_status,
      staff_email: r.staff_email,
      staff_name: nameByEmail.get(r.staff_email.toLowerCase()) ?? r.staff_email,
      covering_staff_email: coveringEmail,
      covering_staff_name: coveringEmail ? nameByEmail.get(coveringEmail) ?? coveringEmail : null,
    };
  });
}

/** GET: my upcoming absences, and the cover requests addressed to me. */
async function getAbsences(_request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const email = await callerEmailOf(auth);
    if (!email) return NextResponse.json({ success: true, data: { mine: [], requests: [] } });

    const svc = createServiceRoleClient();
    const today = istToday();

    const { data: myAssignments, error: myAssignmentsError } = await svc
      .from('tms_staff_route_assignment').select('id').eq('staff_email', email).eq('is_active', true);
    if (myAssignmentsError) {
      console.error('boarding absence: myAssignments query error:', myAssignmentsError);
      return NextResponse.json({ error: 'Failed to load your route assignments' }, { status: 500 });
    }
    const myIds = ((myAssignments ?? []) as { id: string }[]).map((a) => a.id);

    const { data: mineRows, error: mineError } = await svc
      .from('tms_incharge_absence').select('*')
      .ilike('staff_email', emailIlikePattern(email))
      .gte('absence_date', today)
      .order('absence_date', { ascending: true });
    if (mineError) {
      console.error('boarding absence: mineRows query error:', mineError);
      return NextResponse.json({ error: 'Failed to load your absences' }, { status: 500 });
    }

    // An empty list here MUST mean "genuinely no requests" — never "the query
    // failed" — because this drives whether a nominee sees a pending cover
    // request at all.
    const { data: reqRows, error: reqError } = myIds.length
      ? await svc.from('tms_incharge_absence').select('*')
          .in('covering_assignment_id', myIds)
          .gte('absence_date', today)
          .order('absence_date', { ascending: true })
      : { data: [] as AbsenceDbRow[], error: null };
    if (reqError) {
      console.error('boarding absence: reqRows query error:', reqError);
      return NextResponse.json({ error: 'Failed to load cover requests' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        mine: await decorate(svc, (mineRows ?? []) as AbsenceDbRow[]),
        requests: await decorate(svc, (reqRows ?? []) as AbsenceDbRow[]),
      },
    });
  } catch (e) {
    console.error('boarding absence list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST: declare an absence, optionally nominating a covering colleague. */
async function declareAbsence(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ATTENDANCE_SCAN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      routeId?: string; date?: string; reason?: string; coveringStaffEmail?: string;
    };
    const routeId = String(body.routeId ?? '');
    const date = String(body.date ?? '');
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    // A past absence cannot be declared: the day is already scored, and
    // back-dating an excuse would let anyone erase a miss after the fact.
    if (date < istToday()) {
      return NextResponse.json({ error: 'Absence can only be declared for today or a future day' }, { status: 400 });
    }

    // Declarations are only accepted while share scoring is actually live.
    //
    // A row written now would be honoured RETROACTIVELY the moment the flag
    // flips: the month verdict subtracts every excused date from requiredDays,
    // so someone who posted one declaration per remaining weekday while the
    // feature was dormant would face an empty window, pass, and have their
    // transport bill cancelled without marking anybody. The blanket-declaration
    // policy itself (a cap? an approval step?) is the repo owner's call and is
    // deliberately NOT decided here -- this only stops the rows accumulating
    // before there is a policy to apply to them.
    //
    // GET and the respond route stay ungated: reading your own absences, and
    // answering a request that already exists, change nothing.
    const svcCfg = createServiceRoleClient();
    const cfg = await loadSchedulingConfig(svcCfg);
    if (!cfg.inchargeShareScoringEnabled) {
      return NextResponse.json({
        error: 'Absence declarations are not open yet: per-share attendance is not active on this system.',
        reason: 'share_scoring_disabled',
      }, { status: 409 });
    }

    const email = await callerEmailOf(auth);
    if (!email) return NextResponse.json({ error: 'Your profile has no email' }, { status: 400 });

    const assigned = await getAssignedRouteIdsForUser(auth);
    if (!assigned.includes(routeId)) {
      return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });
    }

    const svc = svcCfg;
    const { data: mine, error: mineError } = await svc
      .from('tms_staff_route_assignment').select('id')
      .eq('route_id', routeId).eq('staff_email', email).eq('is_active', true).maybeSingle();
    if (mineError) {
      // A query failure here must not be reported as "you are not assigned" —
      // that tells someone they lack authority they actually have.
      console.error('boarding absence: mine assignment query error:', mineError);
      return NextResponse.json({ error: 'Failed to verify your route assignment' }, { status: 500 });
    }
    const assignmentId = (mine as { id: string } | null)?.id;
    if (!assignmentId) return NextResponse.json({ error: 'You are not assigned to this route' }, { status: 403 });

    let coveringAssignmentId: string | null = null;
    const coveringEmail = body.coveringStaffEmail?.toLowerCase().trim() || null;
    if (coveringEmail) {
      if (coveringEmail === email) {
        return NextResponse.json({ error: 'You cannot nominate yourself as cover' }, { status: 400 });
      }
      const { data: cover, error: coverError } = await svc
        .from('tms_staff_route_assignment').select('id')
        .eq('route_id', routeId).eq('staff_email', coveringEmail).eq('is_active', true).maybeSingle();
      if (coverError) {
        console.error('boarding absence: cover assignment query error:', coverError);
        return NextResponse.json({ error: 'Failed to verify the covering colleague' }, { status: 500 });
      }
      coveringAssignmentId = (cover as { id: string } | null)?.id ?? null;
      if (!coveringAssignmentId) {
        return NextResponse.json({ error: 'That colleague is not an in-charge on this route' }, { status: 400 });
      }
    }

    const { data: row, error } = await svc
      .from('tms_incharge_absence')
      .upsert({
        assignment_id: assignmentId,
        staff_email: email,
        route_id: routeId,
        absence_date: date,
        reason: body.reason?.trim() || null,
        covering_assignment_id: coveringAssignmentId,
        // Re-declaring resets the request: a new nominee has not agreed yet,
        // and no nominee at all means nobody is being asked.
        cover_status: coveringAssignmentId ? 'pending' : 'uncovered',
        responded_at: null,
      }, { onConflict: 'assignment_id,absence_date' })
      .select('id')
      .single();
    if (error) {
      console.error('absence upsert error:', error);
      return NextResponse.json({ error: 'Failed to record absence' }, { status: 500 });
    }

    if (coveringEmail) {
      const { data: prof } = await svc.from('profiles').select('id').ilike('email', emailIlikePattern(coveringEmail)).maybeSingle();
      const profileId = (prof as { id: string } | null)?.id;
      if (profileId) {
        await notifyProfile(svc, {
          profileId,
          actorId: auth.userId,
          title: 'Cover requested for bus attendance',
          body: `A colleague on your bus will be absent on ${date} and has asked you to mark their students that day. Open the in-charge page to accept or decline.`,
          url: '/boarding/in-charge',
        });
      }
    }

    await logActivity(auth, request, {
      module: 'boarding',
      action: 'mark',
      entityType: 'tms_incharge_absence',
      entityId: row?.id,
      description: `Declared in-charge absence on ${date} for route ${routeId}`,
      metadata: { routeId, date, coveringEmail },
    });
    return NextResponse.json({ success: true, data: { id: row?.id } }, { status: 201 });
  } catch (e) {
    console.error('boarding absence create error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getAbsences(request, auth));
export const POST = withAuth((request, auth) => declareAbsence(request, auth));
