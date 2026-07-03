import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Audience resolver for the TMS notification module.
 *
 * Turns a `targeting` jsonb into the concrete set of recipient profile ids
 * (profiles.id == auth.users.id) at SEND time. The message row records WHO it was
 * aimed at (the targeting shape); the resolved ids become tms_notification_recipient
 * rows. Runs under the service-role client (RLS bypassed) inside the send path.
 *
 * Resolution strategy (hybrid — see the module design spec):
 *   • passenger / driver → concrete entity tables (learners_profiles, tms_driver),
 *     the complete + precise transport populations.
 *   • admin / boarding   → holders of the area's TMS permission, via the DB helper
 *     tms_users_with_permission() (there is no clean role table for these).
 *   • route passengers   → all-time distinct learners with a booking on the route
 *     (tms_booking), mapped to their profile id.
 *   • route driver       → the route's assigned driver, honoring BOTH assignment
 *     columns (tms_route.driver_id=staff.id and tms_driver.assigned_route_id), the
 *     same pair lib/driver/routes.ts resolves.
 *
 * Every branch is FAIL-CLOSED: a query error throws rather than returning a partial
 * audience, so a broadcast never silently reaches nobody.
 */

type Svc = ReturnType<typeof createServiceRoleClient>;

export type NotificationRole = 'admin' | 'boarding' | 'driver' | 'passenger';
export type RouteAudience = 'passengers' | 'driver' | 'staff';

export type Targeting =
  | { type: 'broadcast' }
  | { type: 'role'; roles: NotificationRole[] }
  | { type: 'route'; route_ids: string[]; include?: RouteAudience[] }
  | { type: 'emails'; emails: string[] } // admin-friendly "specific users" by email
  | { type: 'users'; user_ids: string[] } // programmatic: raw profile ids
  | { type: 'user'; user_id: string };

export const NOTIFICATION_ROLES: NotificationRole[] = ['admin', 'boarding', 'driver', 'passenger'];

/** The TMS permission that defines each portal population (see lib/auth/areas.ts). */
const PERMISSION_FOR_ROLE: Record<'admin' | 'boarding' | 'driver', string> = {
  admin: 'tms.dashboard.view',
  boarding: 'tms.attendance.scan',
  driver: 'tms.driver.self.view',
};

const CHUNK = 150; // keep .in() lists under the API-gateway limit (see lib/fees/bills.ts)

function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function unique(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => !!x))];
}

/** Every profile id holding a TMS permission (super admins + any active granting role). */
async function usersWithPermission(svc: Svc, permission: string): Promise<string[]> {
  const { data, error } = await svc.rpc('tms_users_with_permission', { p_permission: permission });
  if (error) throw new Error(`audience: resolve permission "${permission}" failed: ${error.message}`);
  // setof uuid can arrive as ['id', …] or [{ tms_users_with_permission: 'id' }, …]; normalize both.
  const rows = (data ?? []) as unknown[];
  return unique(
    rows.map((r) =>
      typeof r === 'string' ? r : ((r as Record<string, string>)?.tms_users_with_permission ?? null),
    ),
  );
}

/** All bus-using learners (the transport "passenger" population). */
async function allPassengers(svc: Svc): Promise<string[]> {
  const { data, error } = await svc
    .from('learners_profiles')
    .select('profile_id')
    .eq('bus_required', true)
    .not('profile_id', 'is', null);
  if (error) throw new Error(`audience: resolve passengers failed: ${error.message}`);
  return unique((data ?? []).map((r: { profile_id: string | null }) => r.profile_id));
}

/** All onboarded drivers (tms_driver is the true driver population). */
async function allDrivers(svc: Svc): Promise<string[]> {
  const { data, error } = await svc.from('tms_driver').select('profile_id').not('profile_id', 'is', null);
  if (error) throw new Error(`audience: resolve drivers failed: ${error.message}`);
  return unique((data ?? []).map((r: { profile_id: string | null }) => r.profile_id));
}

async function roleUsers(svc: Svc, role: NotificationRole): Promise<string[]> {
  switch (role) {
    case 'admin':
      return usersWithPermission(svc, PERMISSION_FOR_ROLE.admin);
    case 'boarding':
      return usersWithPermission(svc, PERMISSION_FOR_ROLE.boarding);
    case 'driver': {
      // Reach EVERY driver-portal user, not just onboarded tms_driver rows: union the
      // entity table with holders of the driver-area permission. A portal driver may
      // hold tms.driver.self.view without a tms_driver row (and vice-versa), and
      // excluding them silently dropped them from broadcasts.
      const [byEntity, byPerm] = await Promise.all([
        allDrivers(svc),
        usersWithPermission(svc, PERMISSION_FOR_ROLE.driver),
      ]);
      return unique([...byEntity, ...byPerm]);
    }
    case 'passenger':
      return allPassengers(svc);
    default:
      return [];
  }
}

/**
 * Learners (→ profile ids) on the given routes. Two sources unioned for the most
 * complete "learners on this route":
 *   (a) permanent assignment — learners_profiles.transport_route_id (the canonical
 *       route roster; ~859 learners across 24 routes), and
 *   (b) all-time ad-hoc riders — distinct tms_booking.learner_id on the route.
 */
async function routePassengers(svc: Svc, routeIds: string[]): Promise<string[]> {
  if (routeIds.length === 0) return [];
  const profiles: string[] = [];

  // (a) permanently-assigned learners (profile_id is on the row → no learner→profile map)
  for (const c of chunk(routeIds)) {
    const { data, error } = await svc
      .from('learners_profiles')
      .select('profile_id')
      .in('transport_route_id', c)
      .not('profile_id', 'is', null);
    if (error) throw new Error(`audience: resolve route assigned passengers failed: ${error.message}`);
    profiles.push(...(data ?? []).map((r: { profile_id: string | null }) => r.profile_id).filter((x): x is string => !!x));
  }

  // (b) all-time ad-hoc bookers on the route, mapped to their profile id
  const learnerIds: string[] = [];
  for (const c of chunk(routeIds)) {
    const { data, error } = await svc.from('tms_booking').select('learner_id').in('route_id', c);
    if (error) throw new Error(`audience: resolve route passengers (bookings) failed: ${error.message}`);
    learnerIds.push(...(data ?? []).map((r: { learner_id: string | null }) => r.learner_id).filter((x): x is string => !!x));
  }
  for (const c of chunk(unique(learnerIds))) {
    const { data, error } = await svc
      .from('learners_profiles')
      .select('profile_id')
      .in('id', c)
      .not('profile_id', 'is', null);
    if (error) throw new Error(`audience: map route learners→profiles failed: ${error.message}`);
    profiles.push(...(data ?? []).map((r: { profile_id: string | null }) => r.profile_id).filter((x): x is string => !!x));
  }

  return unique(profiles);
}

/** The driver(s) assigned to the given routes, via BOTH assignment columns. */
async function routeDrivers(svc: Svc, routeIds: string[]): Promise<string[]> {
  if (routeIds.length === 0) return [];
  const out: string[] = [];
  // (a) tms_route.driver_id = staff.id → staff.profile_id
  const staffIds: string[] = [];
  for (const c of chunk(routeIds)) {
    const { data, error } = await svc.from('tms_route').select('driver_id').in('id', c);
    if (error) throw new Error(`audience: resolve route driver_id failed: ${error.message}`);
    staffIds.push(...(data ?? []).map((r: { driver_id: string | null }) => r.driver_id).filter((x): x is string => !!x));
  }
  for (const c of chunk(unique(staffIds))) {
    const { data, error } = await svc.from('staff').select('profile_id').in('id', c).not('profile_id', 'is', null);
    if (error) throw new Error(`audience: map route staff→profile failed: ${error.message}`);
    out.push(...(data ?? []).map((r: { profile_id: string | null }) => r.profile_id).filter((x): x is string => !!x));
  }
  // (b) tms_driver.assigned_route_id ∈ routes → tms_driver.profile_id
  for (const c of chunk(routeIds)) {
    const { data, error } = await svc
      .from('tms_driver')
      .select('profile_id')
      .in('assigned_route_id', c)
      .not('profile_id', 'is', null);
    if (error) throw new Error(`audience: resolve assigned_route_id drivers failed: ${error.message}`);
    out.push(...(data ?? []).map((r: { profile_id: string | null }) => r.profile_id).filter((x): x is string => !!x));
  }
  return unique(out);
}

/**
 * Boarding / attendance staff actively assigned to the given routes. The link is
 * tms_staff_route_assignment (keyed by staff_email, stored lowercase — see
 * lib/boarding/identity.ts), which we map back to profile ids by email.
 */
async function routeStaff(svc: Svc, routeIds: string[]): Promise<string[]> {
  if (routeIds.length === 0) return [];
  const emails: string[] = [];
  for (const c of chunk(routeIds)) {
    const { data, error } = await svc
      .from('tms_staff_route_assignment')
      .select('staff_email')
      .in('route_id', c)
      .eq('is_active', true);
    if (error) throw new Error(`audience: resolve route staff assignments failed: ${error.message}`);
    emails.push(
      ...(data ?? [])
        .map((r: { staff_email: string | null }) => r.staff_email?.toLowerCase())
        .filter((x): x is string => !!x),
    );
  }
  const uniqueEmails = unique(emails);
  if (uniqueEmails.length === 0) return [];
  const profiles: string[] = [];
  for (const c of chunk(uniqueEmails)) {
    // staff_email + profiles.email are both normalized lowercase in this system.
    const { data, error } = await svc.from('profiles').select('id').in('email', c);
    if (error) throw new Error(`audience: map route staff emails→profiles failed: ${error.message}`);
    profiles.push(...(data ?? []).map((r: { id: string }) => r.id).filter(Boolean));
  }
  return unique(profiles);
}

/**
 * Resolve a targeting object into a deduped set of recipient profile ids.
 * Throws on any resolution failure (fail-closed).
 */
export async function resolveTargeting(svc: Svc, targeting: Targeting): Promise<string[]> {
  switch (targeting.type) {
    case 'broadcast': {
      const sets = await Promise.all(NOTIFICATION_ROLES.map((r) => roleUsers(svc, r)));
      return unique(sets.flat());
    }
    case 'role': {
      const roles = unique(targeting.roles) as NotificationRole[];
      const sets = await Promise.all(roles.map((r) => roleUsers(svc, r)));
      return unique(sets.flat());
    }
    case 'route': {
      const include = targeting.include && targeting.include.length > 0 ? targeting.include : ['passengers'];
      const routeIds = unique(targeting.route_ids);
      const parts: string[][] = [];
      if (include.includes('passengers')) parts.push(await routePassengers(svc, routeIds));
      if (include.includes('driver')) parts.push(await routeDrivers(svc, routeIds));
      if (include.includes('staff')) parts.push(await routeStaff(svc, routeIds));
      return unique(parts.flat());
    }
    case 'emails': {
      // Match emails exactly as stored (trimmed). Chunked to stay under the .in() limit.
      const emails = unique(targeting.emails.map((e) => e.trim()).filter(Boolean));
      if (emails.length === 0) return [];
      const out: string[] = [];
      for (const c of chunk(emails)) {
        const { data, error } = await svc.from('profiles').select('id').in('email', c);
        if (error) throw new Error(`audience: resolve emails failed: ${error.message}`);
        out.push(...(data ?? []).map((r: { id: string }) => r.id).filter(Boolean));
      }
      return unique(out);
    }
    case 'users':
      return unique(targeting.user_ids);
    case 'user':
      return unique([targeting.user_id]);
    default:
      return [];
  }
}

/** Count-only resolution for the compose "estimated recipients" preview. */
export async function estimateRecipients(svc: Svc, targeting: Targeting): Promise<number> {
  return (await resolveTargeting(svc, targeting)).length;
}

/** Human-readable one-line summary of a stored targeting jsonb (list/detail/confirm). */
export function describeTargeting(targeting: Targeting | null | undefined): string {
  if (!targeting || typeof targeting !== 'object') return 'Unknown';
  const t = targeting as Targeting;
  switch (t.type) {
    case 'broadcast':
      return 'Everyone (broadcast)';
    case 'role':
      return `Roles: ${t.roles?.join(', ') || '—'}`;
    case 'route': {
      const inc = t.include && t.include.length ? ` (${t.include.join(' + ')})` : ' (passengers)';
      const n = t.route_ids?.length ?? 0;
      return `${n} route${n === 1 ? '' : 's'}${inc}`;
    }
    case 'emails':
      return `${t.emails?.length ?? 0} user${t.emails?.length === 1 ? '' : 's'} (by email)`;
    case 'users':
      return `${t.user_ids?.length ?? 0} user${t.user_ids?.length === 1 ? '' : 's'}`;
    case 'user':
      return '1 user';
    default:
      return 'Unknown';
  }
}

/**
 * Validate + normalize an untrusted targeting payload (from the compose form).
 * Returns null when the shape is invalid.
 */
export function normalizeTargeting(raw: unknown): Targeting | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  switch (t.type) {
    case 'broadcast':
      return { type: 'broadcast' };
    case 'role': {
      const roles = Array.isArray(t.roles)
        ? (t.roles.filter((r) => (NOTIFICATION_ROLES as string[]).includes(r as string)) as NotificationRole[])
        : [];
      return roles.length ? { type: 'role', roles } : null;
    }
    case 'route': {
      const route_ids = Array.isArray(t.route_ids) ? (t.route_ids.filter((x) => typeof x === 'string') as string[]) : [];
      const include = Array.isArray(t.include)
        ? (t.include.filter((x) => x === 'passengers' || x === 'driver' || x === 'staff') as RouteAudience[])
        : undefined;
      return route_ids.length ? { type: 'route', route_ids, include } : null;
    }
    case 'emails': {
      const emails = Array.isArray(t.emails)
        ? (t.emails.filter((x) => typeof x === 'string' && (x as string).includes('@')) as string[])
        : [];
      return emails.length ? { type: 'emails', emails } : null;
    }
    case 'users': {
      const user_ids = Array.isArray(t.user_ids) ? (t.user_ids.filter((x) => typeof x === 'string') as string[]) : [];
      return user_ids.length ? { type: 'users', user_ids } : null;
    }
    case 'user':
      return typeof t.user_id === 'string' && t.user_id ? { type: 'user', user_id: t.user_id } : null;
    default:
      return null;
  }
}
