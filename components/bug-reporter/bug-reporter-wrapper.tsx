'use client';

import { BugReporterProvider } from '@boobalan_jkkn/bug-reporter-sdk';
import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';

// ─────────────────────────────────────────────────────────────────────────────
// JKKN Bug Reporter (Bug Boundary) wrapper.
//
// Rendered inside each portal layout's AUTHENTICATED return (admin/student/
// driver/boarding), so the floating widget only mounts for signed-in users.
//
// CORS: the SDK POSTs bug reports straight from the BROWSER. Pointed at the
// external platform that would be a cross-origin request, which the platform's
// CORS blocks. So we point the SDK's apiUrl at OUR OWN origin — its calls to
// /api/v1/public/* then stay same-origin and hit our relay
// (app/api/v1/public/[...path]/route.ts), which forwards to the real platform
// server-side (no CORS between servers). window is client-only, so we resolve
// the origin after mount.
//
// User context comes from the app's existing AuthProvider (useAuth), not a second
// supabase.auth subscription — the auth-provider keeps a single auth-state
// listener to avoid cross-tab auth-lock contention.
// ─────────────────────────────────────────────────────────────────────────────

// The SDK's network capture (on by default in v1.3+) ships recent requests WITH
// each report. Requests to Supabase carry the user's live JWT in the
// Authorization header, so exclude the Supabase host from capture. App /api/*
// calls stay captured (same-origin, useful, stay inside JKKN).
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host || null;
  } catch {
    return null;
  }
})();

const NETWORK_EXCLUDE: RegExp[] | undefined = supabaseHost
  ? [new RegExp(supabaseHost.replace(/[.]/g, '\\.'), 'i')]
  : undefined;

const API_KEY = process.env.NEXT_PUBLIC_BUG_REPORTER_API_KEY;
const PLATFORM_URL = process.env.NEXT_PUBLIC_BUG_REPORTER_API_URL;

// The platform is "configured" only once the real URL is set (not missing and not
// the shipped placeholder). Until then we render nothing rather than a widget that
// would fail on submit.
const CONFIGURED = !!API_KEY && !!PLATFORM_URL && !PLATFORM_URL.includes('your-platform.com');

/**
 * `enabled` lets a portal switch the floating widget OFF without unmounting the
 * tree below it — the SDK renders the widget as `enabled && apiClient && <Widget/>`,
 * so flipping it keeps `children` mounted (no page-state loss on toggle).
 * The student portal passes false for a fee-blocked learner: someone confined to
 * the fees page shouldn't be offered the bug-report widget.
 */
export function BugReporterWrapper({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const { user, profile } = useAuth();

  // Point the SDK at our own origin so its browser calls hit the same-origin relay.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  if (!CONFIGURED || !origin) return <>{children}</>;

  return (
    <BugReporterProvider
      apiKey={API_KEY as string}
      apiUrl={origin}
      enabled={enabled}
      debug={process.env.NODE_ENV === 'development'}
      networkExcludePatterns={NETWORK_EXCLUDE}
      userContext={
        user
          ? {
              userId: user.id,
              name: profile?.full_name || user.email?.split('@')[0] || 'Anonymous',
              email: profile?.email || user.email || undefined,
            }
          : undefined
      }
    >
      {children}
    </BugReporterProvider>
  );
}
