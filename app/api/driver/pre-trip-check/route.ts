import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDriverForUser } from '@/lib/driver/identity';
import { getDriverRoutes } from '@/lib/driver/routes';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { istToday } from '@/lib/booking/window';
import {
  issueLabels,
  isMissingTableError,
  parsePreTripInput,
  parseSkipReason,
  validatePhoto,
  PRE_TRIP_PHOTO_BUCKET,
} from '@/lib/tracking/pre-trip-check';
import {
  activeTripIdOnVehicle,
  alertTransportHead,
  PRE_TRIP_SELECT,
  type PreTripCheckRow,
} from '@/lib/tracking/pre-trip-check-repo';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

/** Postgres unique_violation — one check per driver, bus and day. */
const UNIQUE_VIOLATION = '23505';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * POST /api/driver/pre-trip-check — the signed-in driver records today's pre-trip
 * check for the bus on one of THEIR routes (multipart form). Two shapes:
 *   - the check:  routeId, tyres_ok … first_aid_box_ok ('yes' | 'no'), odometer_km,
 *                 notes?, photo
 *   - a skip:     routeId, skip=1, skip_reason ('camera' | 'network' | 'emergency' |
 *                 'other'), skip_reason_other (required for 'other')
 *
 * This is the ONLY writer of tms_pre_trip_check (no client insert policy). The bus is
 * resolved from the route assignment, never from the body. The photo goes to the
 * private tms-pre-trip-photos bucket under <auth uid>/<IST date>/. Any "no", and any
 * skip, alerts the transport head through the TMS notification plane. Never touches
 * the trip: the check is a reminder, not a gate (Director, 8 Nov).
 */
async function submitCheck(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.TRACKING_TRIP_MANAGE))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Expected a form upload' }, { status: 400 });

    const routeId = typeof form.get('routeId') === 'string' ? (form.get('routeId') as string) : null;
    if (!routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });

    const raw: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) if (typeof v === 'string') raw[k] = v;
    const isSkip = raw.skip === '1' || raw.skip === 'true';

    // Validate everything before any write.
    let skipReason: string | null = null;
    let parsedCheck: ReturnType<typeof parsePreTripInput> | null = null;
    let photoBytes = new Uint8Array();
    let photoType: 'image/jpeg' | 'image/png' | 'image/webp' | null = null;
    if (isSkip) {
      const r = parseSkipReason(raw.skip_reason, raw.skip_reason_other);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      skipReason = r.reason;
    } else {
      parsedCheck = parsePreTripInput(raw);
      if (!parsedCheck.ok) {
        return NextResponse.json({ error: parsedCheck.errors.join(' '), errors: parsedCheck.errors }, { status: 400 });
      }
      const photo = form.get('photo');
      const photoFile = photo instanceof File ? photo : null;
      if (photoFile) photoBytes = new Uint8Array(await photoFile.arrayBuffer());
      // Type comes from the file's first bytes, never from what the phone reports.
      const photoCheck = validatePhoto(photoFile ? { size: photoBytes.length, head: photoBytes.subarray(0, 16) } : null);
      if (!photoCheck.ok) return NextResponse.json({ error: photoCheck.error }, { status: 400 });
      photoType = photoCheck.type;
    }

    const drv = await getDriverForUser(auth);
    if (!drv) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

    const svc = createServiceRoleClient();
    const routes = await getDriverRoutes(drv.staff_id, drv.assigned_route_id, svc);
    const route = routes.find((r) => r.id === routeId);
    if (!route) return NextResponse.json({ error: 'Route not assigned to this driver' }, { status: 403 });
    if (!route.vehicleId) {
      return NextResponse.json({ error: 'No vehicle assigned to this route' }, { status: 422 });
    }
    const vehicleId = route.vehicleId;
    const today = istToday();

    // Upload first (check only); the row only ever points at a photo that exists.
    let path: string | null = null;
    if (photoType) {
      path = `${auth.userId}/${today}/${uuidv4()}.${EXT[photoType]}`;
      const { error: upErr } = await svc.storage
        .from(PRE_TRIP_PHOTO_BUCKET)
        .upload(path, Buffer.from(photoBytes), { contentType: photoType, upsert: false });
      if (upErr) {
        console.error('pre-trip-check photo upload error:', upErr);
        return NextResponse.json({ error: 'Could not save the odometer photo. Please try again.' }, { status: 500 });
      }
    }

    // A check done after the trip started (the full-screen reminder) belongs to it.
    const tripId = await activeTripIdOnVehicle(svc, drv.id, vehicleId).catch(() => null);

    const values =
      isSkip || !parsedCheck?.ok
        ? { skipped: true, skip_reason: skipReason }
        : {
            skipped: false,
            ...parsedCheck.value.items,
            odometer_km: parsedCheck.value.odometerKm,
            odometer_photo_path: path,
            notes: parsedCheck.value.notes,
          };
    const { data, error } = await svc
      .from('tms_pre_trip_check')
      .insert({
        driver_id: drv.id,
        vehicle_id: vehicleId,
        trip_id: tripId,
        check_date: today,
        ...values,
        created_by: auth.userId,
      })
      .select(PRE_TRIP_SELECT)
      .single();

    if (error) {
      // Drop the orphaned photo whatever went wrong.
      if (path) await svc.storage.from(PRE_TRIP_PHOTO_BUCKET).remove([path]);
      if (error.code === UNIQUE_VIOLATION) {
        // Already done (or skipped) today: double tap, or a second phone. Hand it back.
        const { data: existing } = await svc
          .from('tms_pre_trip_check')
          .select(PRE_TRIP_SELECT)
          .eq('driver_id', drv.id)
          .eq('vehicle_id', vehicleId)
          .eq('check_date', today)
          .maybeSingle();
        return NextResponse.json({ success: true, data: { check: existing, alerted: null, alreadyDone: true } });
      }
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: 'The pre-trip check is not switched on yet.' }, { status: 503 });
      }
      throw error;
    }

    const check = data as unknown as PreTripCheckRow;
    const issues = issueLabels(check);

    let alerted: number | null = null;
    if (check.any_issue) {
      const [{ data: veh }, { data: st }] = await Promise.all([
        svc.from('tms_vehicle').select('registration_number').eq('id', vehicleId).maybeSingle(),
        drv.staff_id
          ? svc.from('staff').select('first_name, last_name').eq('id', drv.staff_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const reg = (veh as { registration_number: string | null } | null)?.registration_number;
      const s = st as { first_name: string | null; last_name: string | null } | null;
      const driverName = [s?.first_name, s?.last_name].filter(Boolean).join(' ') || 'The driver';
      alerted = await alertTransportHead(svc, {
        checkId: check.id,
        driverId: drv.id,
        driverName,
        vehicleId,
        busLabel: reg ? `${reg} (route ${route.label})` : `route ${route.label}`,
        issues,
        skipReason: check.skipped ? check.skip_reason : null,
        notes: check.notes,
        actorId: auth.userId,
      });
    }

    await logActivity(auth, request, {
      module: 'drivers',
      action: 'submit',
      entityType: 'tms_pre_trip_check',
      entityId: check.id,
      entityLabel: route.label,
      description: check.skipped
        ? `Driver skipped the pre-trip check: ${check.skip_reason}`
        : check.any_issue
          ? `Driver's pre-trip check found problems: ${issues.join(', ')}`
          : 'Driver completed the pre-trip check, all OK',
      metadata: { routeId, vehicleId, tripId, skipped: check.skipped, issues, alerted },
    });

    return NextResponse.json({ success: true, data: { check, alerted, alreadyDone: false } }, { status: 201 });
  } catch (e) {
    console.error('driver/pre-trip-check POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => submitCheck(request, auth));
