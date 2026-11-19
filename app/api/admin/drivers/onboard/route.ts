import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/api/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';
import { validatePerson } from '@/lib/drivers/staff-fields';
import { onboardDriver, OnboardError } from '@/lib/drivers/onboard';

async function requireManage(auth: AuthContext): Promise<boolean> {
  if (auth.isSuperAdmin) return true;
  const { data } = await auth.supabase.rpc('user_has_permission', { permission_name: 'tms.drivers.manage' });
  return !!data;
}

/** Create a brand-new driver: staff row (shared with MyJKKN) + tms_driver + driver role. */
async function onboard(request: NextRequest, auth: AuthContext) {
  try {
    if (!(await requireManage(auth))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let body: { person?: unknown; transport?: unknown } | null = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const personRaw = body?.person;
    if (typeof personRaw !== 'object' || personRaw === null || Array.isArray(personRaw)) {
      return NextResponse.json(
        { error: 'Please correct the highlighted fields', fields: { firstName: 'Fill in the form and try again' } },
        { status: 400 },
      );
    }
    const checked = validatePerson(personRaw, 'create');
    if (!checked.ok) {
      return NextResponse.json({ error: 'Please correct the highlighted fields', fields: checked.errors }, { status: 400 });
    }
    const transport =
      typeof body?.transport === 'object' && body.transport !== null && !Array.isArray(body.transport)
        ? (body.transport as Record<string, unknown>)
        : {};

    const svc = createServiceRoleClient();
    const result = await onboardDriver(svc, checked.value, transport, auth.userId);

    const p = checked.value;
    const fullName = `${p.firstName} ${p.lastName}`.trim().toUpperCase();
    await logActivity(auth, request, {
      module: 'drivers',
      action: 'create',
      entityType: 'staff',
      entityId: result.id,
      description: `Onboarded driver ${fullName} (${result.staffCode ?? 'no staff code'})`,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    if (e instanceof OnboardError) {
      return NextResponse.json(
        { error: e.message, ...(e.field ? { field: e.field } : {}), ...(e.fields ? { fields: e.fields } : {}) },
        { status: e.status },
      );
    }
    console.error('Onboard driver error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAuth((request, auth) => onboard(request, auth));
