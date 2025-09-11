import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Type definitions would be generated from your Supabase schema
type Database = Record<string, unknown>;

// Lazy client creation to avoid environment variable loading issues
let _supabase: ReturnType<typeof createSupabaseClient<Database>> | null = null;

function getSupabaseClient() {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(`Missing Supabase environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment.`);
    }

    _supabase = createSupabaseClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  
  return _supabase;
}

// Create Supabase client for admin operations
function createClient() {
  return getSupabaseClient();
}

// Export the client creation function
export { createClient };

// Export lazy admin clients using Proxy for compatibility
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient<Database>>, {
  get(target, prop) {
    return getSupabaseClient()[prop as keyof ReturnType<typeof createSupabaseClient<Database>>];
  }
});

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseClient<Database>>, {
  get(target, prop) {
    return getSupabaseClient()[prop as keyof ReturnType<typeof createSupabaseClient<Database>>];
  }
}); 