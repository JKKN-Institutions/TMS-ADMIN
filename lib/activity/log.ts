import { type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { AuthContext } from '@/lib/api/with-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Activity logging. Call AFTER a successful mutation. Never throws — a logging
// failure must never fail the action it describes. Always `await` the call:
// fire-and-forget promises may be killed after the response on serverless.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityAction =
  | 'create' | 'update' | 'delete' | 'import' | 'assign' | 'unassign'
  | 'upload' | 'activate' | 'deactivate' | 'scan' | 'mark';

export type ActivityModule =
  | 'drivers' | 'vehicles' | 'routes' | 'gps-devices' | 'passengers'
  | 'staff-route-assignments' | 'boarding' | 'enrollment' | 'grievances'
  | 'settings' | 'transport-years';

export interface ActivityEntry {
  module: ActivityModule;
  action: ActivityAction;
  /** Table or domain noun, e.g. 'tms_vehicle'. */
  entityType?: string;
  entityId?: string | number | null;
  /** Human-readable label, e.g. registration number or route name. */
  entityLabel?: string | null;
  description?: string;
  /** Before/after snapshots when cheap to provide. */
  changes?: { before?: unknown; after?: unknown } | null;
  metadata?: Record<string, unknown> | null;
}

function clientInfo(request: NextRequest) {
  const fwd = request.headers.get('x-forwarded-for');
  return {
    ip_address: fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip'),
    user_agent: request.headers.get('user-agent'),
  };
}

async function insertLog(
  actor: { id: string | null; email: string | null; role: string | null },
  request: NextRequest,
  entry: ActivityEntry
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('tms_activity_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      module: entry.module,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId != null ? String(entry.entityId) : null,
      entity_label: entry.entityLabel ?? null,
      description: entry.description ?? null,
      changes: entry.changes ?? null,
      metadata: entry.metadata ?? null,
      ...clientInfo(request),
    });
    if (error) console.error('[activity-log] insert failed:', error.message);
  } catch (e) {
    console.error('[activity-log] insert threw:', e);
  }
}

/** For MODERN routes wrapped in withAuth — actor from AuthContext. */
export async function logActivity(
  auth: AuthContext,
  request: NextRequest,
  entry: ActivityEntry
): Promise<void> {
  await insertLog({ id: auth.userId, email: auth.email, role: auth.userRole }, request, entry);
}

/**
 * For routes NOT wrapped in withAuth (legacy-style, e.g. gps-devices): the
 * proxy (proxy.ts step 6) stamps x-user-id / x-user-role on every
 * authenticated request, so the actor is still attributable.
 */
export async function logActivityFromHeaders(
  request: NextRequest,
  entry: ActivityEntry
): Promise<void> {
  const id = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  let email: string | null = null;
  if (id) {
    try {
      const supabase = createServiceRoleClient();
      const { data } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', id)
        .single();
      email = data?.email ?? null;
    } catch {
      /* ignore */
    }
  }
  await insertLog({ id, email, role }, request, entry);
}
