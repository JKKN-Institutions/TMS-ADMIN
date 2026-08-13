import { createServiceRoleClient } from '@/lib/supabase/server';
import { emailIlikePattern } from '@/lib/identity/email-match';

type Svc = ReturnType<typeof createServiceRoleClient>;

// Boarding scanners are designated by route assignment: assigning a staff grants
// them the dedicated `transport_boarding` role (via user_roles), so the proxy
// /boarding gate + client can() pass. Best-effort — never fails the assignment.
export async function grantBoardingRole(supabase: Svc, staffEmail: string, assignedBy: string) {
  try {
    const { data: prof } = await supabase.from('profiles').select('id').ilike('email', emailIlikePattern(staffEmail)).maybeSingle();
    const profileId = (prof as { id: string } | null)?.id;
    if (!profileId) return;
    const { data: role } = await supabase.from('custom_roles').select('id').eq('role_key', 'transport_boarding').maybeSingle();
    const roleId = (role as { id: string } | null)?.id;
    if (!roleId) return;
    const { data: existing } = await supabase.from('user_roles').select('id').eq('user_id', profileId).eq('role_id', roleId).maybeSingle();
    if (existing) return;
    await supabase.from('user_roles').insert({ user_id: profileId, role_id: roleId, is_primary: false, assigned_by: assignedBy });
  } catch (e) {
    console.error('grantBoardingRole (non-fatal):', e);
  }
}

// Revoke the boarding role only if the staff has NO remaining active assignments.
export async function maybeRevokeBoardingRole(supabase: Svc, assignmentId: string) {
  try {
    const { data: a } = await supabase.from('tms_staff_route_assignment').select('staff_email').eq('id', assignmentId).maybeSingle();
    const email = (a as { staff_email: string } | null)?.staff_email;
    if (!email) return;
    const { data: remaining } = await supabase
      .from('tms_staff_route_assignment').select('id').eq('staff_email', email).eq('is_active', true).limit(1).maybeSingle();
    if (remaining) return;
    const { data: prof } = await supabase.from('profiles').select('id').ilike('email', emailIlikePattern(email)).maybeSingle();
    const profileId = (prof as { id: string } | null)?.id;
    if (!profileId) return;
    const { data: role } = await supabase.from('custom_roles').select('id').eq('role_key', 'transport_boarding').maybeSingle();
    const roleId = (role as { id: string } | null)?.id;
    if (!roleId) return;
    await supabase.from('user_roles').delete().eq('user_id', profileId).eq('role_id', roleId);
  } catch (e) {
    console.error('maybeRevokeBoardingRole (non-fatal):', e);
  }
}
