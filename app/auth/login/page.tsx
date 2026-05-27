'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bus, Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

const ERROR_MESSAGES: Record<string, string> = {
  no_tms_access:
    'You do not have access to the Transport Management System. Please contact your administrator.',
  no_profile:
    'No JKKN profile found. Please sign in to MyJKKN first to set up your account.',
  inactive: 'Your account has been deactivated. Please contact your administrator.',
  auth_failed: 'Sign-in failed. Please try again.',
  no_code: 'Sign-in was interrupted. Please try again.',
};

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center">
          <div className="inline-flex w-16 h-16 bg-green-600 rounded-2xl items-center justify-center mb-4">
            <Bus className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">JKKN Transport</h1>
          <p className="mt-2 text-gray-600">
            Sign in with your JKKN account to access TMS
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-lg">
            {ERROR_MESSAGES[error] ?? 'Unable to sign in. Please try again.'}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center cursor-pointer justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
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
          )}
          <span>{isLoading ? 'Redirecting…' : 'Sign in with Google'}</span>
        </button>

        <p className="text-center text-xs text-gray-500">
          Only JKKN accounts with transport access can sign in.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="w-6 h-6 animate-spin text-green-600" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
