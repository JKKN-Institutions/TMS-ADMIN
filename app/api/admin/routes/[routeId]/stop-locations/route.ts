import { NextResponse, type NextRequest } from 'next/server';
import { authFromRequest } from '@/lib/api/with-auth';
import { requirePerm } from '@/lib/auth/require-perm';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { logActivity } from '@/lib/activity/log';
import { searchPlaces } from '@/lib/geo/geocode';
import { isMissingColumn, loadTripDirection, loadTripTracks } from '@/lib/stops/pins';
import { parseLocationChanges } from '@/lib/stops/locations';
import { suggestStopLocations, downsampleTrack } from '@/lib/stops/suggest';

/**
 * Map locations of a route's stops.
 *
 * GET                 every active stop, with its location when a person has confirmed
 *                     one. Read by the Track All map and the stop-location editor.
 * GET ?suggest=1      + positions suggested from the route's recorded trips, and one
 *                     trip's path as a guide line. Never saved by this call.
 * GET ?search=<name>  places matching a name, to move the editor's map. Never saved.
 * PUT                 place / move / remove stop locations. Saving is what marks a
 *                     location confirmed — the only thing that puts a pin on a
 *                     learner's tracking map.
 */

type Ctx = { params: Promise<{ routeId: string }> };

type StopRow = {
  id: string;
  stop_name: string;
  sequence_order: number | null;
  stop_time: string | null;
  evening_time: string | null;
  is_major_stop: boolean | null;
  latitude: number | string | null;
  longitude: number | string | null;
  location_confirmed_at?: string | null;
};

const BASE_COLS = 'id, stop_name, sequence_order, stop_time, evening_time, is_major_stop, latitude, longitude';

/** The route's active stops; `pending` = the confirm column does not exist yet. */
async function readStops(svc: ReturnType<typeof createServiceRoleClient>, routeId: string) {
  const first = await svc
    .from('tms_route_stop')
    .select(`${BASE_COLS}, location_confirmed_at`)
    .eq('route_id', routeId)
    .eq('is_active', true)
    .order('sequence_order', { ascending: true });
  if (!first.error) return { rows: (first.data ?? []) as StopRow[], pending: false };
  if (!isMissingColumn(first.error)) throw new Error(first.error.message);

  const fallback = await svc
    .from('tms_route_stop')
    .select(BASE_COLS)
    .eq('route_id', routeId)
    .eq('is_active', true)
    .order('sequence_order', { ascending: true });
  if (fallback.error) throw new Error(fallback.error.message);
  return { rows: (fallback.data ?? []) as StopRow[], pending: true };
}

function toStop(s: StopRow, index: number) {
  const confirmed = !!s.location_confirmed_at && s.latitude != null && s.longitude != null;
  return {
    id: s.id,
    name: s.stop_name,
    order: s.sequence_order ?? index + 1,
    time: s.stop_time,
    eveningTime: s.evening_time,
    isMajor: !!s.is_major_stop,
    // Unconfirmed coordinates are name-lookup guesses; they are not handed out.
    lat: confirmed ? Number(s.latitude) : null,
    lng: confirmed ? Number(s.longitude) : null,
    confirmed,
  };
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const auth = authFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { routeId } = await params;
    const sp = request.nextUrl.searchParams;
    const wantSuggest = sp.get('suggest') === '1';
    const search = sp.get('search');

    // Suggesting and searching are editing aids; plain reading also serves Track All.
    const allowed = wantSuggest || search != null
      ? await requirePerm(auth, TMS_PERMISSIONS.ROUTES_EDIT)
      : await requirePerm(auth, TMS_PERMISSIONS.ROUTES_VIEW, TMS_PERMISSIONS.TRACKING_VIEW);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (search != null) {
      return NextResponse.json({ success: true, places: await searchPlaces(search) });
    }

    const svc = createServiceRoleClient();
    const { data: route } = await svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .eq('id', routeId)
      .maybeSingle();
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    const [{ rows, pending }, direction, tripCount] = await Promise.all([
      readStops(svc, routeId),
      loadTripDirection(svc, routeId),
      svc
        .from('tms_trip')
        .select('id', { count: 'exact', head: true })
        .eq('route_id', routeId)
        .gte('fix_count', 50)
        .then((r) => r.count ?? 0),
    ]);

    const payload: Record<string, unknown> = {
      success: true,
      route: { id: route.id, routeNumber: route.route_number, routeName: route.route_name },
      direction,
      // True until the location_confirmed_at migration is applied: nothing can be saved yet.
      setupPending: pending,
      recordedTrips: tripCount,
      stops: rows.map(toStop),
    };

    if (wantSuggest) {
      const tracks = await loadTripTracks(svc, routeId);
      payload.suggestions = suggestStopLocations(
        rows.map((s) => ({ id: s.id, time: s.stop_time, eveningTime: s.evening_time })),
        tracks,
      );
      // The longest recent morning run (else evening) as a guide line to place pins along.
      const guide =
        [...tracks].filter((t) => t.direction === 'onward').sort((a, b) => b.fixes.length - a.fixes.length)[0] ??
        [...tracks].sort((a, b) => b.fixes.length - a.fixes.length)[0];
      payload.trail = guide ? downsampleTrack(guide.fixes, 400) : [];
      payload.tripsUsed = tracks.length;
    }

    return NextResponse.json(payload);
  } catch (e) {
    console.error('stop-locations GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const auth = authFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await requirePerm(auth, TMS_PERMISSIONS.ROUTES_EDIT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { routeId } = await params;
    const svc = createServiceRoleClient();

    const { data: route } = await svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .eq('id', routeId)
      .maybeSingle();
    if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

    const { rows, pending } = await readStops(svc, routeId);
    if (pending) {
      return NextResponse.json(
        { error: 'Stop locations are not switched on yet — a database update is still pending.' },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = parseLocationChanges(body, new Set(rows.map((r) => r.id)));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { set, clear } = parsed.value;

    const nowIso = new Date().toISOString();
    // Every write is scoped to route_id as well as id: the body was validated against
    // this route's stops, and the filter makes that true at the database too.
    for (const u of set) {
      const { error } = await svc
        .from('tms_route_stop')
        .update({
          latitude: u.lat,
          longitude: u.lng,
          location_confirmed_at: nowIso,
          location_confirmed_by: auth.userId,
          updated_at: nowIso,
        })
        .eq('id', u.stopId)
        .eq('route_id', routeId);
      if (error) throw new Error(error.message);
    }
    if (clear.length > 0) {
      const { error } = await svc
        .from('tms_route_stop')
        .update({
          latitude: null,
          longitude: null,
          location_confirmed_at: null,
          location_confirmed_by: null,
          updated_at: nowIso,
        })
        .in('id', clear)
        .eq('route_id', routeId);
      if (error) throw new Error(error.message);
    }

    const nameById = new Map(rows.map((r) => [r.id, r.stop_name]));
    await logActivity(auth, request, {
      module: 'routes',
      action: 'update',
      entityType: 'tms_route',
      entityId: routeId,
      entityLabel: `Route ${route.route_number ?? ''}`.trim(),
      description:
        `Stop map locations on route ${route.route_number ?? ''}: ` +
        [set.length ? `${set.length} placed` : null, clear.length ? `${clear.length} removed` : null]
          .filter(Boolean)
          .join(', '),
      metadata: {
        routeId,
        placed: set.map((u) => ({ stop: nameById.get(u.stopId) ?? u.stopId, lat: u.lat, lng: u.lng })),
        removed: clear.map((id) => nameById.get(id) ?? id),
      },
    });

    const after = await readStops(svc, routeId);
    return NextResponse.json({
      success: true,
      message: 'Stop locations saved',
      stops: after.rows.map(toStop),
    });
  } catch (e) {
    console.error('stop-locations PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
