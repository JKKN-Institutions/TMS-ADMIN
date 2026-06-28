import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { istToday, addDays } from '@/lib/booking/window';
import { toBookingRow, type RawBooking, type LearnerRef, type BookingRefs } from '@/lib/booking/admin-list';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Read-only admin list of tms_booking rows, scoped to a travel_date range
 * (default: today .. today+92). Denormalizes learner/route/stop labels with
 * chunked .in() lookups. Replaces the legacy handler that queried the dropped
 * `bookings` table with no auth.
 */
async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === '42P01';
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const IN_CHUNK = 150;

/** Chunked .in() fetch (≤150 ids/call) — overflows the API gateway otherwise. */
async function fetchByIds<T>(svc: SupabaseClient, table: string, columns: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const slice = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await svc.from(table).select(columns).in('id', slice);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function list(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.BOOKINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const url = new URL(request.url);
    const today = istToday();
    const from = isDate(url.searchParams.get('from')) ? (url.searchParams.get('from') as string) : today;
    const to = isDate(url.searchParams.get('to')) ? (url.searchParams.get('to') as string) : addDays(today, 92);
    const routeId = url.searchParams.get('route_id');

    const svc = createServiceRoleClient();
    let q = svc
      .from('tms_booking')
      .select('learner_id, travel_date, route_id, stop_id, booked_at, booked_by')
      .gte('travel_date', from)
      .lte('travel_date', to)
      .order('travel_date', { ascending: true })
      .order('booked_at', { ascending: true });
    if (routeId) q = q.eq('route_id', routeId);

    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ success: true, data: { from, to, rows: [] } });
      console.error('admin/bookings list error:', error);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }
    const bookings = (data ?? []) as RawBooking[];

    const learnerIds = [...new Set(bookings.map((b) => b.learner_id))];
    const routeIds = [...new Set(bookings.map((b) => b.route_id))];
    const stopIds = [...new Set(bookings.map((b) => b.stop_id).filter((v): v is string => !!v))];

    const learners = new Map<string, LearnerRef>();
    for (const l of await fetchByIds<{ id: string; first_name: string | null; last_name: string | null; roll_number: string | null; profile_id: string | null }>(
      svc, 'learners_profiles', 'id, first_name, last_name, roll_number, profile_id', learnerIds
    )) {
      learners.set(l.id, { name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim(), roll: l.roll_number, profileId: l.profile_id });
    }
    const routes = new Map<string, string>();
    for (const r of await fetchByIds<{ id: string; route_number: string | null; route_name: string | null }>(
      svc, 'tms_route', 'id, route_number, route_name', routeIds
    )) {
      routes.set(r.id, `${r.route_number ?? '—'} · ${r.route_name ?? ''}`.trim());
    }
    const stops = new Map<string, string>();
    for (const s of await fetchByIds<{ id: string; stop_name: string }>(svc, 'tms_route_stop', 'id, stop_name', stopIds)) {
      stops.set(s.id, s.stop_name);
    }

    const refs: BookingRefs = { learners, routes, stops };
    const rows = bookings.map((b) => toBookingRow(b, refs));
    return NextResponse.json({ success: true, data: { from, to, rows } });
  } catch (e) {
    console.error('admin/bookings list error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => list(request, auth));
