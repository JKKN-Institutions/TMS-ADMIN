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
 * Wraps an API route handler so it only runs for an authenticated TMS user with
 * a profile. Returns proper JSON 401/403 (the proxy also gates these routes, but
 * withAuth provides typed auth context and defense-in-depth).
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest) => {
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

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 403 });
    }

    return handler(request, {
      userId: profile.id,
      userRole: profile.role,
      isSuperAdmin: profile.is_super_admin,
      institutionId: profile.institution_id,
      supabase,
    });
  };
}
