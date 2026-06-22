import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

// Lightweight master-data options endpoint for the fees form's cascading
// dropdowns. MyJKKN owns these tables; TMS reads them. Returns { id, name }[].
//   /api/admin/masters?type=institutions
//   /api/admin/masters?type=degrees&institution_id=…
//   /api/admin/masters?type=departments&institution_id=…&degree_id=…
//   /api/admin/masters?type=programmes&department_id=…
//   /api/admin/masters?type=semesters&program_id=…
//   /api/admin/masters?type=quotas
//   /api/admin/masters?type=staff-roles

async function requirePerm(auth: AuthContext, permission: string): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: permission });
  return !!data;
}

interface MasterCfg {
  table: string;
  nameCol: string;
  /** query-param -> column to filter on (cascading parents). */
  parents?: Record<string, string>;
}

const MASTERS: Record<string, MasterCfg> = {
  institutions: { table: 'institutions', nameCol: 'name' },
  degrees: { table: 'degrees', nameCol: 'degree_name', parents: { institution_id: 'institution_id' } },
  departments: {
    table: 'departments',
    nameCol: 'department_name',
    parents: { institution_id: 'institution_id', degree_id: 'degree_id' },
  },
  programmes: {
    table: 'programs',
    nameCol: 'program_name',
    parents: { institution_id: 'institution_id', degree_id: 'degree_id', department_id: 'department_id' },
  },
  semesters: {
    table: 'semesters',
    nameCol: 'semester_name',
    parents: {
      institution_id: 'institution_id', degree_id: 'degree_id',
      department_id: 'department_id', program_id: 'program_id',
    },
  },
  quotas: { table: 'quotas', nameCol: 'name' },
};

async function getMasters(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requirePerm(auth, TMS_PERMISSIONS.FEES_VIEW))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || '';
    const supabase = createServiceRoleClient();

    // Distinct staff roles (for staff-audience fee structures).
    if (type === 'staff-roles') {
      const { data, error } = await supabase.from('staff').select('role_key').not('role_key', 'is', null);
      if (error) {
        if (error.code === '42P01') return NextResponse.json({ success: true, data: [] });
        return NextResponse.json({ error: 'Failed to load staff roles' }, { status: 500 });
      }
      const uniq = Array.from(new Set((data ?? []).map((r: { role_key: string }) => r.role_key))).sort();
      return NextResponse.json({ success: true, data: uniq.map((k) => ({ id: k, name: k })) });
    }

    const cfg = MASTERS[type];
    if (!cfg) return NextResponse.json({ error: 'Unknown master type' }, { status: 400 });

    let q = supabase
      .from(cfg.table)
      .select(`id, ${cfg.nameCol}`)
      .eq('is_active', true)
      .order(cfg.nameCol, { ascending: true });

    if (cfg.parents) {
      for (const [param, col] of Object.entries(cfg.parents)) {
        const val = url.searchParams.get(param);
        if (val) q = q.eq(col, val);
      }
    }

    const { data, error } = await q;
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [] });
      console.error('Masters query error:', error);
      return NextResponse.json({ error: 'Failed to load master data' }, { status: 500 });
    }

    // Dynamic select string → cast past supabase-js's literal-only type parser.
    const list = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const opts = list.map((r) => ({
      id: r.id as string,
      name: (r[cfg.nameCol] as string) ?? '',
    }));
    return NextResponse.json({ success: true, data: opts });
  } catch (e) {
    console.error('Masters API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth((request, auth) => getMasters(request, auth));
