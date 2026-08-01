import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { logActivity } from '@/lib/activity/log';
import { classifyRouteStatus } from '@/lib/gps/route-status';

/**
 * POST /api/admin/track-all/nudge — remind a driver to start location sharing.
 *
 * Calls dispatchNotification directly rather than notify.ts's notifyProfile wrapper,
 * for two reasons: the wrapper swallows errors and returns void (this is an
 * interactive action, so the admin must be told if it failed), and it does not accept
 * metadata (which is where the cooldown marker lives).
 *
 * Every Supabase read below has its `.error` checked and thrown (caught by the outer
 * try/catch → 500) rather than trusting a bare `data`. A silently-null `data` on, say,
 * the cooldown query would read as "no recent reminder was sent" and let an admin
 * spam a driver's notification inbox without limit — see the cooldown query below.
 */

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Don't let an admin pester the same driver more than twice an hour. */
const COOLDOWN_MIN = 30;

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVERS_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { routeId?: unknown } | null;
    const routeId = typeof body?.routeId === 'string' ? body.routeId : null;
    if (!routeId) {
      return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    const { data: route, error: routeErr } = await svc
      .from('tms_route')
      .select('id, route_number, route_name, vehicle_id, driver_id')
      .eq('id', routeId)
      .maybeSingle();
    if (routeErr) throw routeErr;
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Same dual-linkage resolution the fleet read uses, narrowed to one route.
    const { data: driversData, error: driversErr } = await svc
      .from('tms_driver')
      .select('id, staff_id, profile_id, location_sharing_enabled, active_route_id, assigned_route_id');
    if (driversErr) throw driversErr;
    const drivers = (driversData ?? []) as {
      id: string; staff_id: string | null; profile_id: string | null;
      location_sharing_enabled: boolean | null;
      active_route_id: string | null; assigned_route_id: string | null;
    }[];

    const driver =
      drivers.find((d) => d.active_route_id === routeId) ??
      drivers.find((d) => d.assigned_route_id === routeId) ??
      (route.driver_id ? drivers.find((d) => d.staff_id === route.driver_id) : undefined) ??
      null;

    if (!driver) {
      return NextResponse.json({ error: 'No driver assigned to this route' }, { status: 404 });
    }

    // Re-derive the state server-side. The client's canNudge is a hint, not authority.
    let lastFixAt: string | null = null;
    if (route.vehicle_id) {
      const { data: veh, error: vehErr } = await svc
        .from('tms_vehicle')
        .select('last_gps_update')
        .eq('id', route.vehicle_id)
        .maybeSingle();
      if (vehErr) throw vehErr;
      lastFixAt = (veh as { last_gps_update: string | null } | null)?.last_gps_update ?? null;
    }
    const status = classifyRouteStatus({
      hasDriver: true,
      hasVehicle: !!route.vehicle_id,
      sharing: !!driver.location_sharing_enabled,
      lastFixAt,
      nowMs: Date.now(),
    });
    if (!status.canNudge) {
      return NextResponse.json(
        { error: `This route is ${status.state} — a reminder wouldn't help` },
        { status: 422 },
      );
    }

    // Resolve the driver's auth profile: direct FK first, then via staff.
    let profileId = driver.profile_id;
    if (!profileId && driver.staff_id) {
      const { data: st, error: stErr } = await svc
        .from('staff')
        .select('profile_id')
        .eq('id', driver.staff_id)
        .maybeSingle();
      if (stErr) throw stErr;
      profileId = (st as { profile_id: string | null } | null)?.profile_id ?? null;
    }
    if (!profileId) {
      return NextResponse.json(
        { error: 'This driver has no login account, so they cannot be notified' },
        { status: 404 },
      );
    }

    // Cooldown: look for a tracking reminder we sent this driver recently. Keyed on
    // metadata.driverId so no new table is needed.
    const since = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString();
    const { data: recent, error: recentErr } = await svc
      .from('tms_notification')
      .select('created_at')
      .eq('category', 'tracking')
      .eq('metadata->>driverId', driver.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);
    if (recentErr) throw recentErr;
    const last = (recent ?? [])[0] as { created_at: string } | undefined;
    if (last) {
      const ageMin = Math.floor((Date.now() - Date.parse(last.created_at)) / 60_000);
      return NextResponse.json(
        { error: 'Already reminded recently', retryAfterMin: ageMin },
        { status: 409 },
      );
    }

    const routeLabel = `${route.route_number ?? '?'} · ${route.route_name ?? ''}`.trim();

    await dispatchNotification(svc, {
      title: 'Start location sharing',
      body: `Please open Live Location and go on duty for route ${routeLabel} so admins and students can track the bus.`,
      category: 'tracking',
      priority: 'high',
      url: '/driver/location',
      createdBy: auth.userId,
      metadata: { driverId: driver.id, routeId },
      targeting: { type: 'users', user_ids: [profileId] },
    });

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'notify',
      entityType: 'tms_driver',
      entityId: driver.id,
      entityLabel: routeLabel,
      description: `Reminded driver to start location sharing on route ${routeLabel}`,
      metadata: { routeId, state: status.state },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('track-all/nudge POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => handler(request, auth));
