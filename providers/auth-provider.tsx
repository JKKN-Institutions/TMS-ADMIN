'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  institution_id: string | null;
  department_id: string | null;
  avatar_url: string | null;
  phone_number: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const PROFILE_COLUMNS =
  'id, email, full_name, role, is_super_admin, is_active, institution_id, department_id, avatar_url, phone_number';

/**
 * TRANSITIONAL COMPATIBILITY SHIM.
 *
 * ~16 legacy admin pages/components still read localStorage 'adminUser' for
 * display + created_by values and guard with `if (!adminUser) redirect('/login')`.
 * Supabase cookies + proxy.ts are the REAL source of auth truth; this just feeds
 * the legacy reads so those pages keep working until each is migrated to
 * useAuth(). Remove this once all 'adminUser' reads are gone.
 */
function syncLegacyAdminUser(profile: Profile | null) {
  if (typeof window === 'undefined') return;
  if (!profile) {
    localStorage.removeItem('adminUser');
    return;
  }
  const displayName = profile.full_name || profile.email;
  localStorage.setItem(
    'adminUser',
    JSON.stringify({
      id: profile.id,
      name: displayName,
      username: displayName,
      email: profile.email,
      role: profile.role,
      is_super_admin: profile.is_super_admin,
      institution_id: profile.institution_id,
      permissions: [],
    })
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileCacheRef = useRef<{ data: Profile; timestamp: number } | null>(
    null
  );
  // createClientSupabaseClient() is a singleton, so this is stable across renders.
  const supabase = createClientSupabaseClient();

  const fetchProfile = useCallback(
    async (userId: string) => {
      const cached = profileCacheRef.current;
      if (cached && Date.now() - cached.timestamp < PROFILE_CACHE_TTL) {
        setProfile(cached.data);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .single();

      if (!error && data) {
        const typed = data as unknown as Profile;
        setProfile(typed);
        profileCacheRef.current = { data: typed, timestamp: Date.now() };
        syncLegacyAdminUser(typed);
      }
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    profileCacheRef.current = null;
    syncLegacyAdminUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    profileCacheRef.current = null; // invalidate cache
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    let active = true;

    // Initial session check (getUser validates the JWT).
    supabase.auth
      .getUser()
      .then(({ data: { user } }: { data: { user: User | null } }) => {
        if (!active) return;
        setUser(user);
      if (user) fetchProfile(user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        profileCacheRef.current = null;
        syncLegacyAdminUser(null);
      }
      // TOKEN_REFRESHED / USER_UPDATED leave the profile unchanged → skip.
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
