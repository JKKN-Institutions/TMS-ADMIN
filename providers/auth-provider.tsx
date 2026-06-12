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
const PROFILE_CACHE_KEY = 'tms-profile-cache:v1';

const PROFILE_COLUMNS =
  'id, email, full_name, role, is_super_admin, is_active, institution_id, department_id, avatar_url, phone_number';

// ─────────────────────────────────────────────────────────────────────────────
// Persistent profile cache. The in-memory ref dies on every reload, which made
// EVERY page load pay getUser() + profiles select (2 sequential round trips)
// before the admin shell could render — the "Loading MYJKKN TMS…" splash.
// localStorage survives reloads, so warm loads render instantly and revalidate
// in the background. Display-only: proxy.ts + the API routes do the real
// authorization on every request, so a ≤TTL-stale role here can't grant access.
// ─────────────────────────────────────────────────────────────────────────────

interface CachedProfile {
  data: Profile;
  timestamp: number;
}

function readProfileCache(userId: string): CachedProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfile;
    if (!parsed?.data?.id || parsed.data.id !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProfileCache(cached: CachedProfile | null) {
  if (typeof window === 'undefined') return;
  try {
    if (cached) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cached));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* storage full / blocked — cache is an optimisation only */
  }
}

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
  const profileCacheRef = useRef<CachedProfile | null>(null);
  // createClientSupabaseClient() is a singleton, so this is stable across renders.
  const supabase = createClientSupabaseClient();

  const fetchProfile = useCallback(
    async (userId: string, opts?: { force?: boolean }) => {
      if (!opts?.force) {
        const cached = profileCacheRef.current;
        if (
          cached &&
          cached.data.id === userId &&
          Date.now() - cached.timestamp < PROFILE_CACHE_TTL
        ) {
          setProfile(cached.data);
          return;
        }
      }

      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .single();

      if (!error && data) {
        const typed = data as unknown as Profile;
        const entry = { data: typed, timestamp: Date.now() };
        setProfile(typed);
        profileCacheRef.current = entry;
        writeProfileCache(entry);
        syncLegacyAdminUser(typed);
        return;
      }

      // Fetch failed (network blip, transient RLS/API error). Fall back to ANY
      // cached copy — even stale — instead of leaving profile null, which would
      // pin the layout on the splash screen forever.
      console.error('Profile fetch failed:', error?.message);
      const fallback = profileCacheRef.current ?? readProfileCache(userId);
      if (fallback) {
        setProfile(fallback.data);
        profileCacheRef.current = fallback;
        syncLegacyAdminUser(fallback.data);
      }
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    profileCacheRef.current = null;
    writeProfileCache(null);
    syncLegacyAdminUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id, { force: true });
  }, [user, fetchProfile]);

  useEffect(() => {
    let active = true;

    // Initial session check. getSession() reads the auth cookie LOCALLY (no
    // network) — proxy.ts has already validated the JWT server-side on this very
    // request, so re-validating here with getUser() only added a sequential
    // Supabase Auth round trip to every page load.
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      if (!active) return;
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);

      if (!sessionUser) {
        setLoading(false);
        return;
      }

      // Warm path: seed from the persistent cache and render the shell NOW;
      // revalidate in the background if the cache is older than the TTL.
      const cached = readProfileCache(sessionUser.id);
      if (cached) {
        profileCacheRef.current = cached;
        setProfile(cached.data);
        syncLegacyAdminUser(cached.data);
        setLoading(false);
        if (Date.now() - cached.timestamp >= PROFILE_CACHE_TTL) {
          void fetchProfile(sessionUser.id, { force: true });
        }
        return;
      }

      // Cold path (first visit on this browser): must await the profile before
      // clearing loading, else `!profile` guards bounce an authenticated user.
      fetchProfile(sessionUser.id).finally(() => {
        if (active) setLoading(false);
      });
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
        writeProfileCache(null);
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
