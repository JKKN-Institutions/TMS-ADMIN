import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { resolveArea, AREA_PERMISSION, resolveHomeForRole } from '@/lib/auth/areas';

// ─────────────────────────────────────────────────────────────────────────────
// Next.js 16 "proxy" (formerly middleware). The file is named proxy.ts, so the
// exported function MUST be named `proxy` (Next throws ProxyMissingExportError
// otherwise). This runs on every matched request and is the primary auth gate.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/callback',
  '/unauthorized',
  '/access-denied',
]);

const PUBLIC_PATH_PREFIXES = [
  '/_next/',
  '/api/auth/',
  '/favicon',
  '/manifest',
  '/sw.',
  '/icons/',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // API routes get JSON errors; pages get redirects.
  const isApi = pathname.startsWith('/api/');

  // 1. Public paths skip auth.
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 2. Supabase client with request/response cookie plumbing (refreshes session).
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 3. Validate session.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Fetch profile + active status.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, role, is_super_admin, is_active, institution_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    if (isApi) {
      return NextResponse.json({ error: 'No profile found' }, { status: 403 });
    }
    return NextResponse.redirect(
      new URL('/unauthorized?reason=no_profile', request.url)
    );
  }

  if (!profile.is_active) {
    if (isApi) {
      return NextResponse.json({ error: 'Account inactive' }, { status: 403 });
    }
    return NextResponse.redirect(
      new URL('/unauthorized?reason=inactive', request.url)
    );
  }

  // 5. Area-based access gate (super admins bypass all areas). Each area (admin /
  //    student / driver / boarding) requires its own permission; a user lacking it
  //    is sent to their OWN area's home rather than a dead-end 403.
  if (!profile.is_super_admin) {
    const area = resolveArea(pathname);
    const { data: hasAccess } = await supabase.rpc('user_has_permission', {
      permission_name: AREA_PERMISSION[area],
    });

    if (!hasAccess) {
      if (isApi) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      let home = resolveHomeForRole(profile.role, profile.is_super_admin);
      if (home === '/dashboard' && !profile.is_super_admin) {
        // Boarding scanners are permission-identified (transport_boarding role via
        // user_roles), not role-identified — route them to /boarding.
        const { data: canScan } = await supabase.rpc('user_has_permission', {
          permission_name: 'tms.attendance.scan',
        });
        if (canScan) home = '/boarding/scan';
      }
      if (pathname === home) {
        return NextResponse.redirect(
          new URL('/unauthorized?reason=no_tms_access', request.url)
        );
      }
      return NextResponse.redirect(new URL(home, request.url));
    }
  }

  // 6. Pass user context downstream (API routes / server components).
  response.headers.set('x-user-id', profile.id);
  response.headers.set('x-user-role', profile.role);
  response.headers.set('x-user-institution', profile.institution_id || '');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
