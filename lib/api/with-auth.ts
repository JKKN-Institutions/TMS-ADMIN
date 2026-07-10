import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Auth context handed to wrapped API handlers.
 *
 * `supabase` here is the USER-SCOPED client (RLS applies). For admin operations
 * that must bypass RLS, import createServiceRoleClient from '@/lib/supabase/server'
 * inside the handler.
 */
export interface AuthContext {
  userId: string;
  email: string | null;
  userRole: string;
  isSuperAdmin: boolean;
  institutionId: string | null;
  supabase: ReturnType<typeof createServerClient>;
}

type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthContext
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps an API route handler so it only runs for an authenticated TMS user.
 *
 * The identity is read from the `x-user-*` request headers that proxy.ts stamps
 * on every authenticated request (see proxy.ts step 6). The proxy has ALREADY
 * validated the JWT (getUser) and loaded the profile on this same request, so
 * re-doing both here — as this wrapper used to — was two redundant Supabase round
 * trips paid on EVERY API call. Reading the forwarded headers instead costs zero
 * network.
 *
 * Security: the proxy runs before every matched route (its matcher covers all of
 * /api/*) and STRIPS any inbound x-user-* before re-setting them, so these headers
 * can only originate from the proxy. If they are somehow absent, the request did
 * not pass the proxy — we fail CLOSED with 401 rather than trusting a bare request.
 *
 * `supabase` here is still the user-scoped client (RLS applies) for the handlers /
 * requirePerm helpers that use it; constructing it makes no network call.
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest) => {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            // API responses don't refresh session cookies.
          },
        },
      }
    );

    return handler(request, {
      userId,
      email: request.headers.get('x-user-email') || null,
      userRole: request.headers.get('x-user-role') ?? '',
      isSuperAdmin: request.headers.get('x-user-super') === '1',
      institutionId: request.headers.get('x-user-institution') || null,
      supabase,
    });
  };
}
