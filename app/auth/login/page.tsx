'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
// Motion (motion.dev) — published as framer-motion in this project. `m` plus
// LazyMotion is the small build: only the features this screen uses are loaded.
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion';
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
import jkknLogo from '@/public/images/login/jkkn-logo.png';
import { BusScene } from './bus-scene';
import {
  SPRING_PRESS,
  SPRING_SOFT,
  card,
  fadeUp,
  listStagger,
  panelStagger,
  pop,
} from './login-motion';
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

/*
 * Motion rules for this screen (they fail silently when broken):
 *  - An element Motion moves must not also carry Tailwind's `transition`,
 *    `transition-all` or `transition-transform`: the CSS transition lags every
 *    frame Motion writes. Use `transition-colors` (and name box-shadow if needed).
 *  - Motion leaves `opacity: 1` inline after a fade, which beats classes such as
 *    `disabled:opacity-80`. Fade a wrapper instead of the element that needs them.
 *  - Inside <LazyMotion strict> only `m.*` works; `motion.*` throws.
 */

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
    <m.section
      aria-label="JKKN Smart Transport"
      variants={panelStagger}
      initial="hidden"
      animate="show"
      className={`${styles.brandGradient} relative isolate flex flex-col overflow-hidden px-5 pb-11 pt-4 [@media(max-width:639px)_and_(max-height:720px)]:pt-3 text-white [@media(max-width:639px)_and_(max-height:720px)]:pb-10 sm:px-8 sm:pb-8 sm:pt-6 md:pb-10 lg:sticky lg:top-0 lg:h-dvh lg:px-10 lg:py-9 xl:px-14 xl:py-11`}
    >
      {/* Decorative layers */}
      <div aria-hidden="true" className={`${styles.pattern} pointer-events-none absolute inset-0 -z-10`} />
      <div
        aria-hidden="true"
        className={`${styles.float} pointer-events-none absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-green-400/20 blur-3xl`}
      />
      <div
        aria-hidden="true"
        className={`${styles.floatSlow} pointer-events-none absolute -bottom-32 -left-20 -z-10 h-96 w-96 rounded-full bg-green-300/10 blur-3xl`}
      />
      {/* Floating route motif (desktop only) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 220 120"
        className={`${styles.floatSlow} pointer-events-none absolute right-6 top-5 -z-10 hidden w-40 text-green-300/40 xl:block`}
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
        <circle cx="212" cy="16" r="6" fill="#86efac" fillOpacity="0.7" />
      </svg>

      {/* Branding */}
      <m.header variants={fadeUp} className="flex items-center gap-3">
        {/* bg-[#fff], not bg-white: globals.css remaps .bg-white in dark mode,
            and the logo / Google mark must always sit on true white. */}
        <span className="flex h-10 shrink-0 items-center rounded-xl bg-[#fff] px-2 sm:h-12 sm:px-2.5 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] ring-1 ring-white/40">
          {/* eager: it is the LCP element on phones */}
          <Image src={jkknLogo} alt="JKKN" className="h-7 w-auto sm:h-8" sizes="80px" loading="eager" />

        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold leading-tight tracking-tight">
            JKKN Transport
          </span>
          <span className="block truncate text-xs font-medium tracking-wide text-white/90">
            Move Smart. Travel Better.
          </span>
        </span>
      </m.header>

      {/* Headline. On phones and tablets the college bus drives beside it; on
          desktop the headline has the row to itself (the bus is shown large below). */}
      <div className="mt-4 flex items-end gap-1 [@media(max-width:639px)_and_(max-height:720px)]:mt-2 sm:mt-7 sm:gap-4 md:mt-10 lg:mt-auto lg:block lg:pt-8">
        <div className="min-w-0 flex-1">
        <m.h2
          variants={fadeUp}
          className="text-[1.45rem] font-bold leading-[1.12] tracking-tight sm:text-4xl xl:text-[3.1rem]"
        >
          Smart{' '}
          <span className="text-green-200">
            Transport
          </span>{' '}
          Service
        </m.h2>
        <m.p
          variants={fadeUp}
          className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-white/90 hidden sm:mt-3 sm:block sm:text-base"
        >
          Smarter Journeys. Safer Travel. Better Connectivity.
        </m.p>
        </div>

        {/* Phone and tablet: the JKKN college bus drives in from the right and
            keeps cruising. On phones it is pulled past the panel padding so it
            reads as arriving. Its road and streaks are absolutely positioned,
            so they add no height — this screen must not scroll on a phone. */}
        <BusScene
          size="compact"
          className="-mr-4 w-[52%] max-w-[230px] shrink-0 sm:mr-0 sm:w-[40%] sm:max-w-[300px] lg:hidden"
        />
      </div>

      {/* Feature cards — hidden on phones to keep sign-in close to the top */}
      <m.ul
        variants={listStagger}
        className="mt-7 hidden gap-3 md:grid md:grid-cols-3 lg:mt-6 lg:grid-cols-1 lg:gap-2.5 xl:mt-7 xl:grid-cols-3 xl:gap-3"
      >
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <m.li
            key={title}
            variants={fadeUp}
            whileHover={{ y: -3, transition: SPRING_PRESS }}
            className="group flex gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-md lg:py-3 xl:p-4 transition-colors duration-300 hover:border-green-200/30 hover:bg-white/[0.11] motion-reduce:transition-none lg:items-center xl:flex-col xl:items-start"
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff] text-green-600 shadow-[0_6px_14px_-4px_rgba(5,46,22,0.45)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
              {Icon === MapPin && (
                <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                  <span className={`${styles.pulse} absolute inline-flex h-full w-full rounded-full bg-green-300`} />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-green-700" />
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-snug">{title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-white/85">
                {description}
              </span>
            </span>
          </m.li>
        ))}
      </m.ul>

      {/* Desktop: the same JKKN college bus, large, driving under the feature
          cards. The box flexes with the viewport height and the bus scales to
          fit it, so short laptop screens never overflow. */}
      <BusScene
        size="large"
        className="mt-7 hidden lg:mt-6 lg:block lg:min-h-28 lg:flex-1 lg:max-h-[300px] xl:mt-7 lg:[@media(max-height:620px)]:hidden"
      />

      <m.p
        variants={fadeUp}
        className="mt-6 hidden text-xs font-medium tracking-wide text-white/80 md:block lg:mt-5 xl:mt-7"
      >
        Connected Campus <span className="text-green-300/80">•</span> Safe Travel{' '}
        <span className="text-green-300/80">•</span> Smart Future
      </m.p>
    </m.section>
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
    <LazyMotion features={domAnimation} strict>
    {/* "user": with the device's reduce-motion setting on, Motion skips every
        movement and keeps only the fades. */}
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-white lg:grid lg:grid-cols-2 dark:bg-neutral-950">
      <BrandPanel />

      <main className="relative isolate flex flex-1 items-start justify-center bg-gradient-to-b from-green-50/70 via-white to-green-50/50 px-4 pb-5 pt-8 [@media(max-width:639px)_and_(max-height:720px)]:pb-2 [@media(max-width:639px)_and_(max-height:720px)]:pt-6 sm:px-8 sm:py-12 md:items-center lg:min-h-dvh lg:py-10 dark:from-neutral-950 dark:via-neutral-950 dark:to-green-950/30">
        <div aria-hidden="true" className={`${styles.dots} pointer-events-none absolute inset-0 -z-10 dark:opacity-30`} />

        <m.div
          variants={card}
          initial="hidden"
          animate="show"
          className="relative w-full max-w-[440px] rounded-[28px] border border-green-900/10 bg-white px-5 py-6 shadow-[0_1px_2px_rgba(20,83,45,0.06),0_28px_64px_-24px_rgba(20,83,45,0.28)] sm:p-9 -mt-10 sm:mt-0 dark:border-white/10 dark:bg-neutral-900 dark:shadow-[0_28px_64px_-24px_rgba(0,0,0,0.6)]"
        >
          {/* Card header */}
          <div className="flex flex-col items-center text-center">
            <m.span
              variants={pop}
              className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600 sm:h-16 sm:w-16 text-white shadow-[0_12px_24px_-8px_rgba(22,163,74,0.55)]"
            >
              <Bus className="h-6 w-6 sm:h-8 sm:w-8" aria-hidden="true" />
              <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center sm:h-7 sm:w-7 justify-center rounded-full bg-green-700 text-white ring-4 ring-white dark:ring-neutral-900">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </m.span>
            <m.h1
              variants={fadeUp}
              className="mt-4 text-[1.3rem] font-bold tracking-tight text-green-950 sm:mt-6 sm:text-[1.7rem] dark:text-white"
            >
              Welcome to JKKN Transport
            </m.h1>
            <m.p
              variants={fadeUp}
              className="mt-1.5 text-[13px] leading-relaxed text-slate-500 sm:mt-2.5 sm:text-sm dark:text-neutral-400"
            >
              Sign in with your registered institutional Google account to access
              your transport services.
            </m.p>
          </div>

          {/* The error opens and closes instead of popping in. The outer box
              animates its height, so the spacing lives on the inner one. */}
          <AnimatePresence>
            {message && (
              <m.div
                key="sign-in-error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={SPRING_SOFT}
                className="overflow-hidden"
              >
                <div
                  role="alert"
                  className="mt-4 sm:mt-6 flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{message}</span>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* The wrapper takes the entrance fade; the button itself only ever
              gets a transform from Motion, so `disabled:opacity-80` still works. */}
          <m.div variants={fadeUp} className="mt-5 sm:mt-7">
            <m.button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              aria-busy={isLoading}
              whileHover={isLoading ? undefined : { y: -2, transition: SPRING_PRESS }}
              whileTap={isLoading ? undefined : { scale: 0.98, transition: SPRING_PRESS }}
              className="group flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-green-600 px-4 py-3 sm:py-3.5 font-semibold text-white shadow-[0_10px_24px_-8px_rgba(22,163,74,0.55)] transition-[background-color,box-shadow] duration-200 hover:bg-green-700 hover:shadow-[0_16px_32px_-10px_rgba(21,128,61,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80 motion-reduce:transition-none dark:focus-visible:ring-offset-neutral-900"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff] shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
                <AnimatePresence mode="wait" initial={false}>
                  <m.span
                    key={isLoading ? 'busy' : 'google'}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.14 }}
                    className="flex"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-green-600" aria-hidden="true" />
                    ) : (
                      <GoogleIcon className="h-[18px] w-[18px]" />
                    )}
                  </m.span>
                </AnimatePresence>
              </span>
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={isLoading ? 'busy' : 'idle'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.14 }}
                >
                  {isLoading ? 'Redirecting to Google…' : 'Continue with Google'}
                </m.span>
              </AnimatePresence>
            </m.button>
          </m.div>
          <p className="sr-only" aria-live="polite">
            {isLoading ? 'Redirecting to Google sign-in' : ''}
          </p>

          {/* Security note */}
          <m.div variants={fadeUp} className="mt-4 flex items-start [@media(max-width:639px)_and_(max-height:720px)]:items-center gap-3 rounded-2xl border border-green-100 bg-green-50/80 p-3 sm:mt-6 sm:p-4 dark:border-green-900/40 dark:bg-green-950/30">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-600 [@media(max-width:639px)_and_(max-height:720px)]:h-7 [@media(max-width:639px)_and_(max-height:720px)]:w-7 text-white shadow-[0_6px_14px_-4px_rgba(22,163,74,0.45)]">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-green-900 dark:text-green-200">
                Secure Institutional Access
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-green-800/75 [@media(max-width:639px)_and_(max-height:720px)]:hidden dark:text-green-300/70">
                Only registered JKKN users are allowed to log in.
              </span>
            </span>
          </m.div>

          {/* Support */}
          <m.div variants={fadeUp} className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 [@media(max-width:639px)_and_(max-height:720px)]:mt-3 [@media(max-width:639px)_and_(max-height:720px)]:pt-3 sm:mt-6 sm:pt-5 dark:border-white/10">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600 text-white shadow-[0_6px_14px_-4px_rgba(22,163,74,0.45)]">
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
          </m.div>

          {/* Footer — the app has no Terms / Privacy pages yet, so these are
              plain text rather than links to URLs that don't exist. */}
          <m.p variants={fadeUp} className="mt-4 text-center text-[11px] [@media(max-width:639px)_and_(max-height:720px)]:mt-3 sm:mt-6 leading-relaxed text-slate-400 dark:text-neutral-500">
            By continuing, you agree to the{' '}
            <span className="font-medium text-slate-500 dark:text-neutral-400">Terms of Service</span>{' '}
            and{' '}
            <span className="font-medium text-slate-500 dark:text-neutral-400">Privacy Policy</span>.
            <br />© {new Date().getFullYear()} JKKN Educational Institutions
          </m.p>
        </m.div>
      </main>
    </div>
    </MotionConfig>
    </LazyMotion>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-white dark:bg-neutral-950">
          <Loader2 className="h-6 w-6 animate-spin text-green-700" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
