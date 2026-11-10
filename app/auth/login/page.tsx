'use client';

import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Bus,
  Headset,
  Loader2,
  MapPin,
  Navigation,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import busPhoto from '@/public/images/login/jkkn-college-buses.webp';
import jkknLogo from '@/public/images/login/jkkn-logo.png';
import styles from './login.module.css';

// Error codes set by app/auth/callback/route.ts and the proxy redirects.
const ERROR_MESSAGES: Record<string, string> = {
  no_tms_access:
    'You do not have access to the Transport Management System. Please contact your administrator.',
  no_profile:
    'No JKKN profile found. Please sign in to MyJKKN first to set up your account.',
  inactive: 'Your account has been deactivated. Please contact your administrator.',
  auth_failed: 'Sign-in failed. Please try again.',
  no_code: 'Sign-in was interrupted. Please try again.',
};

const FEATURES = [
  {
    icon: MapPin,
    title: 'Live Bus Tracking',
    description: 'Track your buses in real time.',
  },
  {
    icon: Navigation,
    title: 'Smart Route Management',
    description: 'Intelligent route and transport management.',
  },
  {
    icon: Ticket,
    title: 'Digital Bus Pass & Booking',
    description: 'Manage bus passes and booking services.',
  },
] as const;

const delay = (ms: number) => ({ '--enter-delay': `${ms}ms` }) as CSSProperties;

// Official multi-colour Google "G" — must stay unaltered on a white ground.
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

/* ───────────────────────── Left: brand + transport experience ───────────── */

function BrandPanel() {
  return (
    <section
      aria-label="JKKN Smart Transport"
      className={`${styles.brandGradient} relative isolate flex flex-col overflow-hidden px-5 pb-8 pt-6 text-white sm:px-8 md:pb-10 lg:sticky lg:top-0 lg:h-dvh lg:px-10 lg:py-9 xl:px-14 xl:py-11`}
    >
      {/* Decorative layers */}
      <div aria-hidden="true" className={`${styles.pattern} pointer-events-none absolute inset-0 -z-10`} />
      <div
        aria-hidden="true"
        className={`${styles.float} pointer-events-none absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl`}
      />
      <div
        aria-hidden="true"
        className={`${styles.floatSlow} pointer-events-none absolute -bottom-32 -left-20 -z-10 h-96 w-96 rounded-full bg-amber-300/10 blur-3xl`}
      />
      {/* Floating route motif (desktop only) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 220 120"
        className={`${styles.floatSlow} pointer-events-none absolute right-6 top-5 -z-10 hidden w-40 text-amber-300/40 xl:block`}
      >
        <path
          d="M8 104 C 60 104, 60 24, 110 24 S 170 88, 212 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5 7"
          strokeLinecap="round"
        />
        <circle cx="8" cy="104" r="5" fill="currentColor" />
        <circle cx="110" cy="24" r="4" fill="currentColor" />
        <circle cx="212" cy="16" r="6" fill="#fcd34d" fillOpacity="0.7" />
      </svg>

      {/* Branding */}
      <header className={`${styles.enter} flex items-center gap-3`} style={delay(0)}>
        {/* bg-[#fff], not bg-white: globals.css remaps .bg-white in dark mode,
            and the logo / Google mark must always sit on true white. */}
        <span className="flex h-12 shrink-0 items-center rounded-xl bg-[#fff] px-2.5 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] ring-1 ring-white/40">
          {/* eager: it is the LCP element on phones */}
          <Image src={jkknLogo} alt="JKKN" className="h-8 w-auto" sizes="80px" loading="eager" />

        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold leading-tight tracking-tight">
            JKKN Transport
          </span>
          <span className="block truncate text-xs font-medium tracking-wide text-amber-200/90">
            Move Smart. Travel Better.
          </span>
        </span>
      </header>

      {/* Headline */}
      <div className="mt-7 md:mt-10 lg:mt-auto lg:pt-8">
        <h2
          className={`${styles.enter} text-[1.85rem] font-bold leading-[1.12] tracking-tight sm:text-4xl xl:text-[3.1rem]`}
          style={delay(80)}
        >
          Smart{' '}
          <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-400 bg-clip-text text-transparent">
            Transport
          </span>{' '}
          Service
        </h2>
        <p
          className={`${styles.enter} mt-3 max-w-lg text-sm leading-relaxed text-emerald-50/80 sm:text-base`}
          style={delay(160)}
        >
          Smarter Journeys. Safer Travel. Better Connectivity.
        </p>
      </div>

      {/* Feature cards — hidden on phones to keep sign-in close to the top */}
      <ul
        className={`${styles.enter} mt-7 hidden gap-3 md:grid md:grid-cols-3 lg:mt-6 lg:grid-cols-1 lg:gap-2.5 xl:mt-7 xl:grid-cols-3 xl:gap-3`}
        style={delay(240)}
      >
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <li
            key={title}
            className="group flex gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-md lg:py-3 xl:p-4 transition duration-300 hover:-translate-y-0.5 hover:border-amber-200/30 hover:bg-white/[0.11] motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:items-center xl:flex-col xl:items-start"
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-amber-400 text-emerald-950 shadow-[0_6px_14px_-4px_rgba(245,158,11,0.35)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
              {Icon === MapPin && (
                <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                  <span className={`${styles.pulse} absolute inline-flex h-full w-full rounded-full bg-emerald-300`} />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-950" />
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-snug">{title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-emerald-50/70">
                {description}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* Hero photo — real JKKN college fleet. Desktop only (lazy, so phones and
          tablets never download it); flexes with viewport height so short
          laptop screens never overflow. */}
      <figure
        className={`${styles.enter} relative mt-7 hidden overflow-hidden rounded-3xl lg:mt-6 xl:mt-7 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)] ring-1 ring-white/15 lg:block lg:min-h-28 lg:flex-1 lg:max-h-[380px] lg:[@media(max-height:620px)]:hidden`}
        style={delay(320)}
      >
        <Image
          src={busPhoto}
          alt="JKKN college buses lined up on campus"
          fill
          placeholder="blur"
          sizes="45vw"
          className="object-cover object-[60%_45%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-emerald-950/80 via-emerald-950/10 to-transparent"
        />
        <figcaption className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-emerald-950/50 px-3 py-1.5 text-xs font-medium backdrop-blur-md">
          <Bus className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          JKKN College Fleet
        </figcaption>
      </figure>

      <p
        className={`${styles.enter} mt-6 hidden text-xs font-medium tracking-wide text-emerald-50/60 md:block lg:mt-5 xl:mt-7`}
        style={delay(400)}
      >
        Connected Campus <span className="text-amber-300/80">•</span> Safe Travel{' '}
        <span className="text-amber-300/80">•</span> Smart Future
      </p>
    </section>
  );
}

/* ───────────────────────── Right: authentication card ───────────────────── */

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const error = searchParams.get('error');
  const [isLoading, setIsLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // State updates are async, so a fast double-click can slip past `disabled`.
  // The ref closes that window synchronously.
  const inFlight = useRef(false);

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

  // Pressing Back from Google restores this page from the bfcache with the
  // button still in its "Redirecting…" state — reset it.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        inFlight.current = false;
        setIsLoading(false);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  async function handleGoogleLogin() {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    setStartError(null);
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
        setStartError('Could not start Google sign-in. Please try again.');
        inFlight.current = false;
        setIsLoading(false);
      }
      // On success the browser is redirected to Google, so no further work here.
    } catch (e) {
      console.error('Login error:', e);
      setStartError(
        'Could not reach the sign-in service. Check your connection and try again.'
      );
      inFlight.current = false;
      setIsLoading(false);
    }
  }

  const message =
    startError ??
    (error ? ERROR_MESSAGES[error] ?? 'Unable to sign in. Please try again.' : null);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-white lg:grid lg:grid-cols-2 dark:bg-neutral-950">
      <BrandPanel />

      <main className="relative isolate flex items-start justify-center bg-gradient-to-b from-emerald-50/70 via-white to-emerald-50/50 px-4 py-8 sm:px-8 sm:py-12 md:items-center lg:min-h-dvh lg:py-10 dark:from-neutral-950 dark:via-neutral-950 dark:to-emerald-950/30">
        <div aria-hidden="true" className={`${styles.dots} pointer-events-none absolute inset-0 -z-10 dark:opacity-30`} />

        <div
          className={`${styles.enter} relative w-full max-w-[440px] rounded-[28px] border border-emerald-900/10 bg-white p-6 shadow-[0_1px_2px_rgba(6,78,59,0.06),0_28px_64px_-24px_rgba(6,78,59,0.28)] sm:p-9 -mt-10 sm:mt-0 dark:border-white/10 dark:bg-neutral-900 dark:shadow-[0_28px_64px_-24px_rgba(0,0,0,0.6)]`}
          style={delay(150)}
        >
          {/* Card header */}
          <div className="flex flex-col items-center text-center">
            <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-[0_12px_24px_-8px_rgba(6,78,59,0.45)]">
              <Bus className="h-8 w-8" aria-hidden="true" />
              <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-300 text-emerald-950 ring-4 ring-white dark:ring-neutral-900">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </span>
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-emerald-950 sm:text-[1.7rem] dark:text-white">
              Welcome to JKKN Transport
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-500 dark:text-neutral-400">
              Sign in with your registered institutional Google account to access
              your transport services.
            </p>
          </div>

          {message && (
            <div
              role="alert"
              className="mt-6 flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{message}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            aria-busy={isLoading}
            className="group mt-7 flex w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-green-700 to-emerald-700 px-4 py-3.5 font-semibold text-white shadow-[0_10px_24px_-8px_rgba(6,78,59,0.45)] transition duration-200 hover:-translate-y-px hover:from-green-800 hover:to-emerald-800 hover:shadow-[0_16px_32px_-10px_rgba(6,78,59,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-wait disabled:opacity-80 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:focus-visible:ring-offset-neutral-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff] shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-700" aria-hidden="true" />
              ) : (
                <GoogleIcon className="h-[18px] w-[18px]" />
              )}
            </span>
            <span>{isLoading ? 'Redirecting to Google…' : 'Continue with Google'}</span>
          </button>
          <p className="sr-only" aria-live="polite">
            {isLoading ? 'Redirecting to Google sign-in' : ''}
          </p>

          {/* Security note */}
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-[0_1px_2px_rgba(6,78,59,0.08)] ring-1 ring-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300 dark:ring-emerald-800/50">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                Secure Institutional Access
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-emerald-800/75 dark:text-emerald-300/70">
                Only registered JKKN users are allowed to log in.
              </span>
            </span>
          </div>

          {/* Support */}
          <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5 dark:border-white/10">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20">
              <Headset className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium text-slate-700 dark:text-neutral-200">
                Contact Transport Administrator
              </span>
              <span className="block text-xs text-slate-500 dark:text-neutral-400">
                For access issues.
              </span>
            </span>
          </div>

          {/* Footer — the app has no Terms / Privacy pages yet, so these are
              plain text rather than links to URLs that don't exist. */}
          <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400 dark:text-neutral-500">
            By continuing, you agree to the{' '}
            <span className="font-medium text-slate-500 dark:text-neutral-400">Terms of Service</span>{' '}
            and{' '}
            <span className="font-medium text-slate-500 dark:text-neutral-400">Privacy Policy</span>.
            <br />© {new Date().getFullYear()} JKKN Educational Institutions
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
        <div className="flex min-h-dvh items-center justify-center bg-white dark:bg-neutral-950">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-700" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
