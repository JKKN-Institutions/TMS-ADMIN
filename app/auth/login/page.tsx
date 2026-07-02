'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bus, GraduationCap, Loader2, MapPin, Route } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { isNativeApp } from '@/lib/native/platform';
import { nativeGoogleSignIn } from '@/lib/native/google-auth';

const ERROR_MESSAGES: Record<string, string> = {
  no_tms_access:
    'You do not have access to the Transport Management System. Please contact your administrator.',
  no_profile:
    'No JKKN profile found. Please sign in to MyJKKN first to set up your account.',
  inactive: 'Your account has been deactivated. Please contact your administrator.',
  auth_failed: 'Sign-in failed. Please try again.',
  no_code: 'Sign-in was interrupted. Please try again.',
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const error = searchParams.get('error');
  const [isLoading, setIsLoading] = useState(false);

  // If already signed in (e.g. a legacy page bounced an authenticated user
  // here), send them straight to their destination instead of showing login.
  useEffect(() => {
    const supabase = createClientSupabaseClient();
    supabase.auth
      .getUser()
      .then(({ data: { user } }: { data: { user: User | null } }) => {
        if (user) router.replace(redirect);
      });
  }, [router, redirect]);

  async function handleGoogleLogin() {
    setIsLoading(true);
    try {
      const supabase = createClientSupabaseClient();

      if (isNativeApp()) {
        // Native app: system Google Sign-In → exchange the ID token for a Supabase session.
        // The @supabase/ssr browser client writes the session to cookies, so proxy.ts / withAuth
        // authenticate the driver exactly like the web flow.
        const { idToken } = await nativeGoogleSignIn();
        const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
        if (error) {
          console.error('Native sign-in error:', error.message);
          setIsLoading(false);
          return;
        }
        router.replace(redirect);
        return;
      }

      // Web: unchanged OAuth redirect flow.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
            redirect
          )}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) {
        console.error('OAuth error:', error.message);
        setIsLoading(false);
      }
      // On success the browser is redirected to Google, so no further work here.
    } catch (e) {
      console.error('Login error:', e);
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2 bg-white dark:bg-neutral-950">
      {/* ── Brand panel (left on desktop) ───────────────────────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-green-500 via-green-600 to-emerald-700 p-12 text-white">
        {/* Decorative depth: radial glows + dotted grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-900/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:22px_22px]"
        />

        {/* Wordmark */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
            <Bus className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">JKKN Transport</span>
        </div>

        {/* Hero */}
        <div className="relative z-10 max-w-md">
          <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Smart Transport Portal
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/80">
            Track buses in real time, manage routes, and keep every journey on
            schedule — all in one place.
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur-sm ring-1 ring-white/20">
              <MapPin className="h-4 w-4" />
              Live GPS Tracking
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur-sm ring-1 ring-white/20">
              <Route className="h-4 w-4" />
              Smart Routing
            </span>
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-sm text-white/60">
          © 2026 JKKN Educational Institutions
        </p>
      </aside>

      {/* ── Auth panel (right on desktop) ───────────────────────────── */}
      <main className="flex min-h-screen items-center justify-center p-6 sm:p-10 lg:min-h-0">
        <div className="w-full max-w-sm">
          {/* Compact brand header — mobile only */}
          <div className="mb-10 flex items-center justify-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600 text-white">
              <Bus className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
              JKKN Transport
            </span>
          </div>

          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-neutral-50">
              Welcome Back
            </h1>
            <p className="mt-2 text-gray-500 dark:text-neutral-400">
              Sign in to access your transport portal
            </p>
          </div>

          {error && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {ERROR_MESSAGES[error] ?? 'Unable to sign in. Please try again.'}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="mt-8 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-green-600 px-4 py-3.5 font-medium text-white shadow-sm transition-all hover:bg-green-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:focus-visible:ring-offset-neutral-950"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                <GoogleIcon className="h-4 w-4" />
              </span>
            )}
            <span>{isLoading ? 'Redirecting…' : 'Continue with Google'}</span>
          </button>

          <p className="mt-8 text-center text-sm leading-relaxed text-gray-500 dark:text-neutral-400">
            Access is restricted to registered JKKN staff, drivers, and enrolled
            students. If you haven&apos;t been onboarded, please contact your
            administrator.
          </p>

          <p className="mt-10 text-center text-xs text-gray-400 dark:text-neutral-500">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white dark:bg-neutral-950">
          <Loader2 className="h-6 w-6 animate-spin text-green-600" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
