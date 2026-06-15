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
    async (userId: string, opts?: { force?: boolean; fallbackUser?: User }) => {
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
        return;
      }

      // No cache either. Synthesize a minimal display profile from the auth user
      // so the admin shell still renders — the layout's `!profile` guard would
      // otherwise hold "Loading MYJKKN TMS…" indefinitely on any transient
      // profiles-fetch error. Display-only: proxy.ts + the API routes do the real
      // authorization, and usePermissions() still resolves this user's permissions
      // from the RPC by id, so a thin client profile never widens access.
      if (opts?.fallbackUser) {
        const minimal: Profile = {
          id: userId,
          email: opts.fallbackUser.email ?? '',
          full_name: null,
          role: '',
          is_super_admin: false,
          is_active: true,
          institution_id: null,
          department_id: null,
          avatar_url: null,
          phone_number: null,
        };
        setProfile(minimal);
        syncLegacyAdminUser(minimal);
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

    // Fail-safe: the "Loading MYJKKN TMS…" splash gates on `loading`, and the
    // session probe below can stall — getSession() acquires the Supabase auth
    // lock, which is shared ACROSS TABS via the Web Locks API, so another open
    // admin tab mid token-refresh can block this one. Never let that pin the
    // splash: after 4s, stop waiting and let the shell render. proxy.ts already
    // authorized the request server-side, so clearing the spinner is safe.
    const failSafe = setTimeout(() => {
      if (active) setLoading(false);
    }, 4000);

    // Initial session check. getSession() reads the auth cookie LOCALLY (no
    // network) — proxy.ts has already validated the JWT server-side on this very
    // request, so re-validating here with getUser() only added a sequential
    // Supabase Auth round trip to every page load. Wrapped so a rejection (lock
    // timeout, storage error) can't leave the splash up forever.
    const bootstrap = async () => {
      let session: Session | null = null;
      try {
        const res = await supabase.auth.getSession();
        session = res.data.session;
      } catch (e) {
        console.error('getSession failed:', e);
      }
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
          void fetchProfile(sessionUser.id, { force: true, fallbackUser: sessionUser });
        }
        return;
      }

      // Cold path (first visit on this browser): await the profile before
      // clearing loading, else `!profile` guards bounce an authenticated user.
      // fetchProfile falls back to a minimal profile if the fetch fails, so this
      // always resolves to a non-null profile and the splash can't stick.
      try {
        await fetchProfile(sessionUser.id, { fallbackUser: sessionUser });
      } finally {
        if (active) setLoading(false);
      }
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        // CRITICAL: do NOT `await` Supabase calls inside this callback. auth-js
        // invokes it while holding the auth lock; awaiting a token-dependent
        // query (supabase.from(...) needs the access token, which re-acquires
        // that same lock) deadlocks until the lock times out — the root cause of
        // the multi-second splash, especially with several admin tabs open.
        // Fire-and-forget the profile fetch instead.
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          void fetchProfile(session.user.id, { fallbackUser: session.user });
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          profileCacheRef.current = null;
          writeProfileCache(null);
          syncLegacyAdminUser(null);
        }
        // TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION → no profile change.
      }
    );

    return () => {
      active = false;
      clearTimeout(failSafe);
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
