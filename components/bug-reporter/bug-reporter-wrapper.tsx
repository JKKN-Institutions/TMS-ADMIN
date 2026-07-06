'use client';

import { BugReporterProvider } from '@boobalan_jkkn/bug-reporter-sdk';
import { useAuth } from '@/providers/auth-provider';

// ─────────────────────────────────────────────────────────────────────────────
// JKKN Bug Reporter (Bug Boundary) wrapper.
//
// Rendered inside each portal layout's AUTHENTICATED return (admin/student/
// driver/boarding), so the floating widget only mounts for signed-in users —
// never on /auth/login. One provider per portal is safe: the four layouts are
// mutually exclusive by route, so a user is only ever inside one at a time.
//
// User context is fed from the app's existing AuthProvider (useAuth) rather than
// a second supabase.auth subscription — the auth-provider deliberately keeps a
// single auth-state listener to avoid cross-tab auth-lock contention, so we reuse
// its source of truth instead of opening a competing one.
//
// Self-disabling: if the env keys aren't configured it renders children only, so
// a missing key can never break a portal.
// ─────────────────────────────────────────────────────────────────────────────

// The SDK's network capture (on by default in v1.3+) buffers recent requests and
// ships them WITH each bug report to the external platform. Requests to Supabase
// carry the signed-in user's live JWT in the Authorization header, so we exclude
// the Supabase host from capture to keep auth tokens out of bug reports. App-owned
// /api/* calls stay captured (same-origin, useful for triage, stay inside JKKN).
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

export function BugReporterWrapper({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();

  const apiKey = process.env.NEXT_PUBLIC_BUG_REPORTER_API_KEY;
  const apiUrl = process.env.NEXT_PUBLIC_BUG_REPORTER_API_URL;

  // Not configured → transparent passthrough (no floating button, no crash).
  if (!apiKey || !apiUrl) return <>{children}</>;

  return (
    <BugReporterProvider
      apiKey={apiKey}
      apiUrl={apiUrl}
      enabled
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
