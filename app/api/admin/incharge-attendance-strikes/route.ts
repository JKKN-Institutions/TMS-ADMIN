/**
 * Admin view of in-charge attendance strikes.
 *
 * Read-only. Service-role, because the strike table carries no RLS policy for
 * admins, so the permission check here is the only gate — the same
 * defense-in-depth shape as /api/admin/staff-route-assignments.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { loadSchedulingConfig } from '@/lib/settings/scheduling';
import { deriveStrikeStatus, type StrikeStatus } from '@/lib/boarding/incharge-strike-status';

export interface StrikeAdminRow {
  id: string;
  assignment_id: string;
  staff_email: string;
  staff_name: string | null;
  route_id: string | null;
  route_number: string | null;
  route_name: string | null;
  consecutive_misses: number;
  missed_dates: string[];
  last_evaluated_date: string | null;
  warned_at: string | null;
  removed_at: string | null;
  billing_status: string | null;
  status: StrikeStatus;
}

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

async function handler(_request: NextRequest, auth: AuthContext) {
  if (!(await requirePerm(auth, TMS_PERMISSIONS.DRIVERS_ASSIGN))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const svc = createServiceRoleClient();
  const { data: strikes, error } = await svc
    .from('tms_incharge_attendance_strike')
    .select(
      'id, assignment_id, staff_email, route_id, consecutive_misses, missed_dates, last_evaluated_date, warned_at, removed_at, billing_status',
    )
    .order('consecutive_misses', { ascending: false });

  if (error) {
    // 42P01 = table missing. Degrade to an empty board rather than a 500, the
    // same fail-safe the settings route uses.
    if ((error as { code?: string }).code === '42P01') {
      return NextResponse.json({ success: true, data: { mode: 'shadow', rows: [] } });
    }
    console.error('admin/incharge-attendance-strikes GET error:', error);
    return NextResponse.json({ error: 'Failed to load strikes' }, { status: 500 });
  }

  const rows = (strikes ?? []) as Array<Record<string, unknown>>;

  // Resolve staff names and route labels in batched lookups, never per row.
  const emails = new Set(rows.map((r) => String(r.staff_email).toLowerCase()));
  const routeIds = [...new Set(rows.map((r) => r.route_id).filter(Boolean))] as string[];

  const nameByEmail = new Map<string, string>();
  if (emails.size) {
    // profiles.email is NOT uniformly lowercase on this project, so filtering
    // with a lowercased .in() list silently drops those people. Invert the join
    // and intersect in memory instead.
    const { data: profs, error: pErr } = await svc.from('profiles').select('email, full_name');
    if (pErr) console.error('strike profile lookup error:', pErr);
    for (const p of (profs ?? []) as Array<{ email: string | null; full_name: string | null }>) {
      const key = (p.email ?? '').toLowerCase();
      if (key && emails.has(key) && p.full_name) nameByEmail.set(key, p.full_name);
    }
  }

  const routeById = new Map<string, { route_number: string | null; route_name: string | null }>();
  // Chunked: a large .in() list 400s at the gateway and silently returns nothing.
  for (let i = 0; i < routeIds.length; i += 150) {
    const { data: rts, error: rErr } = await svc
      .from('tms_route')
      .select('id, route_number, route_name')
      .in('id', routeIds.slice(i, i + 150));
    if (rErr) console.error('strike route lookup error:', rErr);
    for (const r of (rts ?? []) as Array<{
      id: string;
      route_number: string | null;
      route_name: string | null;
    }>) {
      routeById.set(r.id, { route_number: r.route_number, route_name: r.route_name });
    }
  }

  const cfg = await loadSchedulingConfig(svc);

  const result: StrikeAdminRow[] = rows.map((r) => {
    const route = r.route_id ? routeById.get(String(r.route_id)) : undefined;
    const misses = Number(r.consecutive_misses ?? 0);
    const removedAt = (r.removed_at as string | null) ?? null;
    return {
      id: String(r.id),
      assignment_id: String(r.assignment_id),
      staff_email: String(r.staff_email),
      staff_name: nameByEmail.get(String(r.staff_email).toLowerCase()) ?? null,
      route_id: (r.route_id as string | null) ?? null,
      route_number: route?.route_number ?? null,
      route_name: route?.route_name ?? null,
      consecutive_misses: misses,
      missed_dates: (r.missed_dates as string[] | null) ?? [],
      last_evaluated_date: (r.last_evaluated_date as string | null) ?? null,
      warned_at: (r.warned_at as string | null) ?? null,
      removed_at: removedAt,
      billing_status: (r.billing_status as string | null) ?? null,
      status: deriveStrikeStatus({ consecutive_misses: misses, removed_at: removedAt }),
    };
  });

  return NextResponse.json({
    success: true,
    data: { mode: cfg.inchargeEnforcementMode, rows: result },
  });
}

export const GET = withAuth(handler);
