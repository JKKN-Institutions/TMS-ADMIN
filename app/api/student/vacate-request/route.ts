import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyProfile } from '@/lib/notifications/notify';
import {
  getCurrentTransportYearId,
  resolveLearnerByProfile,
  getLearnerVacateState,
} from '@/lib/vacate/requests';
import { isVacateEligible } from '@/lib/vacate/types';
import { logActivity } from '@/lib/activity/log';

/**
 * Student self-service transport vacate. SELF-SCOPED: the learner is always
 * resolved from the session profile (auth.userId), never from the client.
 *   GET  -> { eligible, request } for the caller's own learner
 *   POST -> create a pending request { reason? }; notifies the transport head
 */
async function handleGet(_request: NextRequest, auth: AuthContext) {
  try {
    const svc = createServiceRoleClient();
    const yearId = await getCurrentTransportYearId(svc);
    const learner = await resolveLearnerByProfile(svc, auth.userId);
    if (!yearId || !learner) {
      return NextResponse.json({ success: true, data: { eligible: false, request: null } });
    }
    const state = await getLearnerVacateState(svc, learner.id, yearId);
    // Gate eligibility on bus_required + active lifecycle too (state.eligible is the bill check).
    const eligible = isVacateEligible({
      busRequired: learner.busRequired,
      lifecycleStatus: learner.lifecycleStatus,
      hasCurrentYearBill: state.eligible,
    });
    return NextResponse.json({ success: true, data: { ...state, eligible } });
  } catch (e) {
    console.error('student vacate GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handlePost(request: NextRequest, auth: AuthContext) {
  try {
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const svc = createServiceRoleClient();

    const yearId = await getCurrentTransportYearId(svc);
    const learner = await resolveLearnerByProfile(svc, auth.userId);
    if (!yearId || !learner) {
      return NextResponse.json({ error: 'No transport account found' }, { status: 400 });
    }

    const state = await getLearnerVacateState(svc, learner.id, yearId);
    const eligible = isVacateEligible({
      busRequired: learner.busRequired,
      lifecycleStatus: learner.lifecycleStatus,
      hasCurrentYearBill: state.eligible,
    });
    if (!eligible) {
      return NextResponse.json({ error: 'You are not eligible to vacate transport.' }, { status: 400 });
    }
    if (state.request && state.request.status === 'pending') {
      return NextResponse.json({ error: 'You already have a pending vacate request.' }, { status: 409 });
    }

    const insert = await svc
      .from('tms_transport_vacate_request')
      .insert({
        learner_id: learner.id,
        profile_id: auth.userId,
        transport_year_id: yearId,
        route_id: learner.routeId,
        stop_id: learner.stopId,
        status: 'pending',
        reason: body.reason?.trim() || null,
      })
      .select('id')
      .maybeSingle();

    if (insert.error) {
      // 23505 = the partial-unique guard caught a racing duplicate.
      if ((insert.error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'You already have a pending vacate request.' }, { status: 409 });
      }
      console.error('student vacate POST insert error:', insert.error);
      return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
    }

    // Notify the transport head(s) — holders of the approve permission.
    try {
      const { data: approvers } = await svc.rpc('tms_users_with_permission', { p_permission: 'tms.vacate.manage' });
      const ids = ((approvers ?? []) as unknown[])
        .map((r) => (typeof r === 'string' ? r : (r as Record<string, string>)?.tms_users_with_permission))
        .filter((x): x is string => !!x);
      for (const pid of [...new Set(ids)]) {
        await notifyProfile(svc, {
          profileId: pid,
          actorId: auth.userId,
          title: 'New transport vacate request',
          body: 'A learner has requested to vacate the bus. Review and approve or reject it.',
          category: 'general',
          url: '/vacate-requests',
        });
      }
    } catch (e) {
      console.error('student vacate notify approvers (non-fatal):', e);
    }

    await logActivity(auth, request, {
      module: 'transport-vacate',
      action: 'submit',
      entityType: 'tms_transport_vacate_request',
      entityId: insert.data?.id ?? null,
      entityLabel: learner.id,
      description: 'Learner submitted a transport vacate request',
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    console.error('student vacate POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => handleGet(request, auth));
export const POST = withAuth((request, auth) => handlePost(request, auth));
