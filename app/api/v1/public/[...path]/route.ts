import { NextResponse, type NextRequest } from 'next/server';
import { scopeRelaySearchToReporter } from '@/lib/bug-reports/relay-scope';
import { buildIndexRow } from '@/lib/bug-reports/index-row';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// Same-origin relay for the JKKN Bug Reporter platform's PUBLIC API.
//
// The in-app reporter WIDGET runs in the browser and is pointed at OUR OWN origin
// (see components/bug-reporter/bug-reporter-wrapper.tsx), so its calls to
// /api/v1/public/* land HERE instead of going cross-origin to the external
// platform — which sidesteps the platform's CORS entirely. We forward
// server-to-server (no CORS between servers) with the X-API-Key injected from env.
//
// Auth: proxy.ts exempts /api/v1/public from the AREA gate but still requires an
// authenticated, active user, so any of the four portals can submit while
// anonymous callers can't abuse our key.
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_URL = (process.env.NEXT_PUBLIC_BUG_REPORTER_API_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.NEXT_PUBLIC_BUG_REPORTER_API_KEY;

function configured(): boolean {
  return !!PLATFORM_URL && !!API_KEY && !PLATFORM_URL.includes('your-platform.com');
}

/**
 * Record a freshly created report in tms_bug_report_index so the admin console
 * can list it later (see lib/bug-reports/index-row.ts for why the index exists).
 *
 * Best-effort by contract: every failure path is swallowed and logged. Awaited
 * rather than fire-and-forget because serverless may kill the function once the
 * response is returned — the same rule lib/activity/log.ts follows.
 */
async function indexSubmittedReport(responseText: string, userEmail: string | null): Promise<void> {
  try {
    const row = buildIndexRow(JSON.parse(responseText), { email: userEmail, name: null });
    if (!row) return;
    const { error } = await createServiceRoleClient()
      .from('tms_bug_report_index')
      // A retried submit re-sends the same platform id; keep one row.
      .upsert(row, { onConflict: 'id' });
    if (error) console.error('bug-reporter index write failed:', error.code, error.message);
  } catch (e) {
    console.error('bug-reporter index write failed:', e);
  }
}

async function relay(request: NextRequest, path: string[]): Promise<Response> {
  if (!configured()) {
    return NextResponse.json(
      { success: false, error: { message: 'Bug Reporter is not configured on the server (set NEXT_PUBLIC_BUG_REPORTER_API_URL).' } },
      { status: 503 }
    );
  }

  const method = request.method.toUpperCase();

  // The platform now REQUIRES `reporter_email` on its bug-report reads and uses it
  // to select whose reports come back (SDK v1.3.2 predates this and sends none, so
  // unscoped reads 400). We supply it from the AUTHENTICATED identity and let that
  // override anything the caller sent — this relay injects an application-wide API
  // key, so whose-reports-are-these is an access-control decision we must own, not
  // a client-controlled query param. See lib/bug-reports/relay-scope.ts.
  let search = new URL(request.url).search;
  if (method === 'GET' && path[0] === 'bug-reports') {
    const scoped = scopeRelaySearchToReporter(search, request.headers.get('x-user-email'));
    if (!scoped.ok) {
      return NextResponse.json(
        { success: false, error: { message: 'Sign in to view your bug reports.' } },
        { status: 401 }
      );
    }
    search = scoped.search;
  }

  const target = `${PLATFORM_URL}/api/v1/public/${path.join('/')}${search}`;

  // Loop guard: the relay's UPSTREAM must be the EXTERNAL reporter platform, never
  // this app's own origin. If NEXT_PUBLIC_BUG_REPORTER_API_URL is (mis)set to this
  // app's domain, forwarding would hit THIS same route recursively — an infinite
  // server-side loop that floods the browser console and can break the widget.
  // Fail fast with a clear diagnostic instead of forwarding.
  const reqHost = request.headers.get('host');
  let targetHost: string | null = null;
  try { targetHost = new URL(target).host; } catch { /* malformed URL → handled below */ }
  if (reqHost && targetHost && reqHost.toLowerCase() === targetHost.toLowerCase()) {
    console.error('bug-reporter relay misconfigured — upstream points at this app (loop):', PLATFORM_URL);
    return NextResponse.json(
      { success: false, error: { message: 'Bug Reporter relay is misconfigured: NEXT_PUBLIC_BUG_REPORTER_API_URL points at this app instead of the reporter platform.' } },
      { status: 500 }
    );
  }

  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.text();

  try {
    const res = await fetch(target, {
      method,
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
        'X-API-Key': API_KEY as string,
      },
      body,
      cache: 'no-store',
    });
    // Pass the platform's response straight back to the (same-origin) caller.
    const text = await res.text();

    // A successful CREATE (POST /bug-reports, not .../{id}/messages) is our one
    // chance to record the report: the platform no longer lets us enumerate
    // reports later. Indexing is best-effort and MUST NOT affect the caller —
    // a submission that reached the platform is a success even if our own write
    // fails, so this never throws and never alters the response.
    if (res.ok && method === 'POST' && path[0] === 'bug-reports' && path.length === 1) {
      await indexSubmittedReport(text, request.headers.get('x-user-email'));
    }

    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e) {
    console.error('bug-reporter relay error:', e);
    return NextResponse.json(
      { success: false, error: { message: (e as Error).message || 'Relay to the Bug Reporter platform failed' } },
      { status: 502 }
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return relay(request, (await ctx.params).path);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  return relay(request, (await ctx.params).path);
}
