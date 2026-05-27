import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client (user-scoped).
 *
 * Uses the SAME Supabase project as MyJKKN — auth.users, profiles, custom_roles
 * and the permission RPCs are shared. PKCE flow is required for the Google OAuth
 * sign-in initiated from the login page.
 *
 * Singleton: one client instance per browser tab so the auth state listener and
 * session cache aren't duplicated across components.
 */
let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClientSupabaseClient() {
  if (clientInstance) return clientInstance;

  clientInstance = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    }
  );

  return clientInstance;
}
