import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import type { SystemInfo } from '@/lib/settings/system-info';
import pkg from '@/package.json';

/**
 * Real system + activity signals for the Settings > System and Security tabs.
 *
 * Gated on SETTINGS_VIEW rather than ACTIVITY_VIEW on purpose: this serves the
 * settings screen, and a settings-only admin must not 403 here. Everything
 * returned is measured — if a probe fails we report that honestly (connected:false,
 * latencyMs:null) instead of substituting a plausible number.
 */
export const dynamic = 'force-dynamic';

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface LogRow {
  actor_email: string | null;
  actor_role: string | null;
  module: string | null;
  action: string | null;
  description: string | null;
  ip_address: string | null;
  created_at: string | null;
}

async function getSystemInfo(auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.SETTINGS_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = createServiceRoleClient();

    const now = Date.now();
    const iso24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const iso7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Time a real query for the DB health probe.
    const probeStart = Date.now();
    const totalRes = await svc.from('tms_activity_log').select('id', { count: 'exact', head: true });
    const latencyMs = Date.now() - probeStart;
    const connected = !totalRes.error;

    const [res24h, res7d, recentRes] = await Promise.all([
      svc.from('tms_activity_log').select('id', { count: 'exact', head: true }).gte('created_at', iso24h),
      svc.from('tms_activity_log').select('id', { count: 'exact', head: true }).gte('created_at', iso7d),
      svc
        .from('tms_activity_log')
        .select('actor_email, actor_role, module, action, description, ip_address, created_at')
        .gte('created_at', iso7d)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Distinct actors / IPs over 7d — derived from a wider slice than `recent`
    // so the counts aren't silently capped by the 10-row display limit.
    const distinctRes = await svc
      .from('tms_activity_log')
      .select('actor_email, ip_address')
      .gte('created_at', iso7d)
      .limit(1000);
    const actors = new Set<string>();
    const ips = new Set<string>();
    for (const r of (distinctRes.data ?? []) as { actor_email: string | null; ip_address: string | null }[]) {
      if (r.actor_email) actors.add(r.actor_email);
      if (r.ip_address) ips.add(r.ip_address);
    }

    const data: SystemInfo = {
      app: {
        version: pkg.version,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
        region: process.env.VERCEL_REGION ?? null,
        nodeVersion: process.version,
        nextVersion: pkg.dependencies?.next ?? 'unknown',
      },
      database: { connected, latencyMs: connected ? latencyMs : null },
      activity: {
        last24h: res24h.count ?? 0,
        last7d: res7d.count ?? 0,
        total: totalRes.count ?? 0,
      },
      security: {
        distinctActors7d: actors.size,
        distinctIps7d: ips.size,
        recent: ((recentRes.data ?? []) as LogRow[]).map((r) => ({
          actorEmail: r.actor_email,
          actorRole: r.actor_role,
          module: r.module,
          action: r.action,
          description: r.description,
          ipAddress: r.ip_address,
          createdAt: r.created_at,
        })),
      },
    };

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('admin/system-info GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((_req, auth) => getSystemInfo(auth));
