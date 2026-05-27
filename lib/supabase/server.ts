import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client (user-scoped, cookie-based).
 *
 * Reads/writes the Supabase auth cookies so Server Components, Route Handlers and
 * Server Actions operate as the signed-in user (RLS applies). This is the SSR
 * counterpart to lib/supabase/client.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component where cookies are read-only.
            // The proxy middleware refreshes the session cookie instead, so this
            // is safe to ignore.
          }
        },
      },
    }
  );
}

/**
 * Service-role Supabase client (bypasses RLS).
 *
 * Use ONLY in trusted server contexts (API routes, server actions) for admin
 * operations that legitimately need to read/write across institutions. Never
 * expose the service role key to the browser.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

/**
 * Convenience helper for server components: returns the authenticated user or
 * null. Always uses getUser() (validates the JWT) rather than getSession().
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}
