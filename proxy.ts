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
  // Scheduled jobs, called by pg_cron via pg_net. They carry a Bearer
  // CRON_SECRET, never a Supabase session cookie, so without these exact-path
  // entries step 3 below 401s them and each route's own secret check never runs.
  //
  // EXACT PATHS ONLY — never widen this to a bare /api/cron prefix entry. A
  // prefix would un-block every future cron route by accident, including any
  // that removes roles or bills people. proxy.test.ts asserts the prefix form
  // stays absent, matching on source text — so do not write that prefix as a
  // quoted string anywhere in this file, not even in a comment.
  '/api/cron/auto-generate-bills',
  // Bus in-charge attendance enforcement. Punitive action is additionally
  // gated by the inchargeEnforcementMode setting, which ships as 'shadow':
  // the job records strikes but notifies, removes and bills nobody until an
  // admin switches it to 'enforce'.
  '/api/cron/incharge-attendance',
  '/api/cron/incharge-month-verdict',
]);

const PUBLIC_PATH_PREFIXES = [
  '/_next/',
  '/api/auth/',
  '/favicon',
  '/manifest', // covers /manifest.webmanifest (unified PWA manifest)
  '/sw.', // covers /sw.js (unified service worker)
  '/icons/',
  '/offline.html', // PWA offline fallback — fetchable before auth
];

// Identity headers the proxy stamps on the authenticated request so downstream
// route handlers (withAuth) and logActivityFromHeaders can attribute the caller
// WITHOUT re-running getUser()+profiles. They are stripped from every inbound
// request first (below) so a client can never spoof them.
const IDENTITY_HEADERS = [
  'x-user-id',
  'x-user-email',
  'x-user-role',
  'x-user-super',
  'x-user-institution',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // API routes get JSON errors; pages get redirects.
  const isApi = pathname.startsWith('/api/');

  // Defense-in-depth: work off a mutable copy of the inbound headers with any
  // client-supplied identity headers removed. Nothing downstream can trust these
  // unless THIS proxy re-sets them on the authenticated path below.
  const requestHeaders = new Headers(request.headers);
  for (const h of IDENTITY_HEADERS) requestHeaders.delete(h);
  const forward = () =>
    NextResponse.next({ request: { headers: requestHeaders } });

  // 1. Public paths skip auth (but still get their spoofed identity stripped).
  if (PUBLIC_PATHS.has(pathname)) return forward();
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return forward();
  }

  // 2. Supabase client with request/response cookie plumbing (refreshes session).
  let response = NextResponse.next({ request: { headers: requestHeaders } });
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
          response = NextResponse.next({ request: { headers: requestHeaders } });
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

  // 4. Fetch the profile row AND run both authorization checks CONCURRENTLY.
  //    getUser() above already validated the JWT; the three reads below are mutually
  //    independent and all scoped to this same authenticated user, so firing them in
  //    parallel collapses what used to be 2–3 SERIAL Supabase round trips — paid on
  //    every page load AND every API call — into a single batch (getUser + this).
  //
  //    The two RPCs are fired SPECULATIVELY; whether we ACT on them is decided below
  //    from the profile (super admins bypass both and simply ignore the extra reads).
  //    profiles.id == auth.users.id by contract (OAuth callback + client guards), so
  //    the student RPC can key on user.id without first awaiting the profile row.
  //
  //    Area gate exemptions: the shared notification inbox/bell APIs and the
  //    '/api/v1/public' Bug Reporter relay are cross-portal — every portal calls the
  //    SAME endpoints, which already scope to the caller's own rows — so they skip
  //    the area gate. They still require an authenticated, active user.
  const AREA_EXEMPT_APIS = ['/api/notifications', '/api/v1/public'];
  const areaExempt = AREA_EXEMPT_APIS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  const area = resolveArea(pathname);

  // Transport-payment gate scope (student area, off the always-allowed paths) — both
  // knowable before any I/O, so we can decide up front whether to fire its RPC.
  const STUDENT_EXEMPT_WHEN_BLOCKED = [
    '/student/fees',
    '/student/grievances',
    '/api/student/transport-access',
    '/api/student/vacate-request',
    '/api/student/transport-context',
  ];
  const studentGateApplies =
    area === 'student' &&
    !STUDENT_EXEMPT_WHEN_BLOCKED.some((p) => pathname === p || pathname.startsWith(p + '/'));

  const [profileRes, areaPermRes, studentAccessRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, role, is_super_admin, is_active, institution_id')
      .eq('id', user.id)
      .single(),
    areaExempt
      ? Promise.resolve({ data: null })
      : supabase.rpc('user_has_permission', { permission_name: AREA_PERMISSION[area] }),
    studentGateApplies
      ? supabase.rpc('tms_student_transport_access', { p_profile_id: user.id })
      : Promise.resolve({ data: null }),
  ]);

  const profile = profileRes.data;

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
  //    is sent to their OWN area's home rather than a dead-end 403. Uses the
  //    area-permission result fetched above.
  if (!profile.is_super_admin && !areaExempt) {
    let hasAccess = areaPermRes.data;

    // Staff self-service: a bus_required staffer WITHOUT tms.attendance.scan may
    // still enter the boarding area to accept (or decline) in-charge duty. JIT
    // eligibility, paid only on the boarding deny path (the brief pre-assignment
    // window; the hot path already holds the permission and never reaches this RPC).
    if (!hasAccess && area === 'boarding') {
      const { data: elig, error: eligError } = await supabase.rpc(
        'tms_staff_boarding_eligibility',
        { p_profile_id: user.id }
      );
      // Fail-closed but not silent — see app/auth/callback/route.ts for why.
      if (eligError) {
        console.error(
          '[proxy] tms_staff_boarding_eligibility failed for %s: %s %s',
          user.id,
          eligError.code,
          eligError.message
        );
      }
      if ((elig as { eligible?: boolean } | null)?.eligible) hasAccess = true;
    }

    if (!hasAccess) {
      if (isApi) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      let home = resolveHomeForRole(profile.role, profile.is_super_admin);
      if (home === '/dashboard' && !profile.is_super_admin) {
        // Boarding scanners are permission-identified (transport_boarding role via
        // user_roles), not role-identified — route them to /boarding. This extra RPC
        // only runs on the (rare) area-gate-denied redirect path, never the hot path.
        const { data: canScan } = await supabase.rpc('user_has_permission', {
          permission_name: 'tms.attendance.scan',
        });
        if (canScan) {
          home = '/boarding/attendance';
        } else {
          // Not a scanner either: this is the ONLY reliable path to the in-charge
          // toggle for a bus_required staffer who hasn't decided yet — the bare
          // domain, the installed PWA (start_url '/'), and /dashboard all land here
          // with area 'admin', never area 'boarding', so the check just above never
          // fires for them. Same RPC + cast idiom as the OAuth callback
          // (app/auth/callback/route.ts). Runs ONLY on this (rare) area-gate-denied
          // redirect path, never the hot path.
          const { data: elig, error: eligError } = await supabase.rpc(
            'tms_staff_boarding_eligibility',
            { p_profile_id: user.id }
          );
          if (eligError) {
            console.error(
              '[proxy] tms_staff_boarding_eligibility failed for %s: %s %s',
              user.id,
              eligError.code,
              eligError.message
            );
          }
          const e = elig as { eligible?: boolean; assigned_route_count?: number } | null;
          if (e?.eligible && (e.assigned_route_count ?? 0) === 0) home = '/boarding/in-charge';
        }
      }
      if (pathname === home) {
        return NextResponse.redirect(
          new URL('/unauthorized?reason=no_tms_access', request.url)
        );
      }
      return NextResponse.redirect(new URL(home, request.url));
    }
  }

  // ── PHASE 2 SEAM (staff fees) ────────────────────────────────────────────────
  // Symmetric to the learner gate (5b below): an eligible boarding staffer whose
  // transport fees are NOT cleared will be redirected to /boarding/fees here, via
  // a tms_staff_transport_access RPC. Not implemented in Phase 1 (no staff bills).

  // 5b. Transport-payment gate (student area, non-super-admins). A learner who is
  //     "behind" — a term past its due date is unpaid for the current transport
  //     year — is confined to the fees page + grievances + sign-out until cleared.
  //     Evaluated by the SECURITY DEFINER RPC (user-scoped client can't read the
  //     RLS-deny billing/fee tables), fetched above alongside the profile.
  if (!profile.is_super_admin && studentGateApplies) {
    const access = studentAccessRes.data as { allowed?: boolean } | null;
    if (access && access.allowed === false) {
      if (isApi) {
        return NextResponse.json(
          { error: 'Transport fees overdue', reason: 'fees_overdue' },
          { status: 402 }
        );
      }
      return NextResponse.redirect(new URL('/student/fees', request.url));
    }
  }

  // 6. Forward the authenticated identity to the route handler on the REQUEST
  //    headers. withAuth reads these instead of re-running getUser() + a profiles
  //    select (2 redundant Supabase round trips it used to pay on EVERY API call,
  //    right after this proxy already validated the same user). Setting them on the
  //    request — not the response — is what actually reaches the handler; the old
  //    code set response headers, so logActivityFromHeaders was silently reading
  //    null. Rebuild the response so the mutated request headers take effect, and
  //    carry over any auth cookies refreshed above.
  requestHeaders.set('x-user-id', profile.id);
  requestHeaders.set('x-user-email', profile.email || '');
  requestHeaders.set('x-user-role', profile.role || '');
  requestHeaders.set('x-user-super', profile.is_super_admin ? '1' : '0');
  requestHeaders.set('x-user-institution', profile.institution_id || '');

  const finalResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.cookies.getAll().forEach((c) => finalResponse.cookies.set(c));
  return finalResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
