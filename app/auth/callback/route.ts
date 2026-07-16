import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { resolveHomeForRole } from '@/lib/auth/areas';

/**
 * OAuth callback (server-side code exchange).
 *
 * 1. Exchange the OAuth `code` for a Supabase session (cookies set on response).
 * 2. Verify the user has a profile (created by MyJKKN — TMS never creates one).
 * 3. Check the account is active.
 * 4. Permission gate: non-super-admins must have tms.dashboard.view.
 *
 * NOTE: the single-arg user_has_permission overload is named `permission_name`
 * and relies on auth.uid() from the session cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=no_code', request.url));
  }

  const response = NextResponse.redirect(new URL(redirect, request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(
      new URL('/auth/login?error=auth_failed', request.url)
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_super_admin, is_active')
    .eq('id', data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL('/auth/login?error=no_profile', request.url)
    );
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL('/auth/login?error=inactive', request.url)
    );
  }

  // Gate: the user must have access to at least ONE TMS area. Use the single-arg
  // user_has_permission — it honors the profiles.role -> custom_roles fallback that
  // grants students/drivers their keys (get_user_merged_permissions misses it).
  // boardingEligible/staffAssignedCount are declared at function scope (not inside the
  // block below) so the home-computation block further down can also read them.
  let boardingEligible = false;
  let staffAssignedCount = 0;
  if (!profile.is_super_admin) {
    const AREA_KEYS = [
      'tms.dashboard.view',
      'tms.passenger.self.view',
      'tms.driver.self.view',
      'tms.attendance.scan',
    ];
    let hasAnyTms = false;
    for (const key of AREA_KEYS) {
      const { data } = await supabase.rpc('user_has_permission', { permission_name: key });
      if (data) {
        hasAnyTms = true;
        break;
      }
    }

    // Bus_required staff have no area permission until they accept the in-charge
    // duty. Admit them via the eligibility oracle so they reach /boarding/in-charge.
    if (!hasAnyTms) {
      const { data: elig } = await supabase.rpc('tms_staff_boarding_eligibility', {
        p_profile_id: data.user.id,
      });
      const e = elig as { eligible?: boolean; assigned_route_count?: number } | null;
      if (e?.eligible) {
        hasAnyTms = true;
        boardingEligible = true;
        staffAssignedCount = e.assigned_route_count ?? 0;
      }
    }

    if (!hasAnyTms) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL('/auth/login?error=no_tms_access', request.url)
      );
    }
  }

  // No explicit redirect requested -> land the user in their area home. We mutate
  // the existing response's Location header so the session cookies set on it are
  // preserved (creating a fresh redirect would drop them).
  if (!searchParams.get('redirect')) {
    let home = resolveHomeForRole(profile.role, profile.is_super_admin);
    if (home === '/dashboard' && !profile.is_super_admin) {
      const { data: canScan } = await supabase.rpc('user_has_permission', {
        permission_name: 'tms.attendance.scan',
      });
      if (canScan) home = '/boarding/attendance';
      else if (boardingEligible && staffAssignedCount === 0) home = '/boarding/in-charge';
    }
    response.headers.set('location', new URL(home, request.url).toString());
  }

  return response;
}
