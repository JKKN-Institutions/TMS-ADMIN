import { NextResponse, type NextRequest } from 'next/server';

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

async function relay(request: NextRequest, path: string[]): Promise<Response> {
  if (!configured()) {
    return NextResponse.json(
      { success: false, error: { message: 'Bug Reporter is not configured on the server (set NEXT_PUBLIC_BUG_REPORTER_API_URL).' } },
      { status: 503 }
    );
  }

  const search = new URL(request.url).search;
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

  const method = request.method.toUpperCase();
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
