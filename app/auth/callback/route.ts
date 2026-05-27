import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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

  if (!profile.is_super_admin) {
    const { data: hasTmsAccess } = await supabase.rpc('user_has_permission', {
      permission_name: 'tms.dashboard.view',
    });

    if (!hasTmsAccess) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL('/auth/login?error=no_tms_access', request.url)
      );
    }
  }

  return response;
}
