// Server-only client for the JKKN Bug Reporter platform's PUBLIC REST API.
//
// Mirrors the SDK's internal api client (node_modules/@boobalan_jkkn/
// bug-reporter-sdk/dist/index.mjs) but runs server-side so our admin route can
// proxy it behind withAuth + requirePerm. Endpoints are the SDK's own paths
// (/api/v1/public/...), authed with the X-API-Key header. The PUBLIC API is
// READ + reply only — it exposes no status/assign/delete endpoint — so this
// module intentionally offers just list / detail / reply.

import type {
  GetBugReportDetailsResponse,
  GetMyBugReportsResponse,
} from '@boobalan_jkkn/bug-reporter-sdk';

const API_URL = process.env.NEXT_PUBLIC_BUG_REPORTER_API_URL;
const API_KEY = process.env.NEXT_PUBLIC_BUG_REPORTER_API_KEY;

// Treat a missing OR still-placeholder URL as "not configured" so the admin UI
// can show a friendly setup notice instead of a fetch error. The repo ships with
// the placeholder https://your-platform.com until the real URL is set in .env.
export function isBugReporterConfigured(): boolean {
  return !!API_URL && !!API_KEY && !API_URL.includes('your-platform.com');
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  if (!isBugReporterConfigured()) {
    throw new Error('Bug Reporter is not configured (missing or placeholder API URL / key).');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY as string,
        ...init?.headers,
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
    if (!res.ok || !body.success) {
      throw new Error(body.error?.message || `Bug Reporter API HTTP ${res.status}`);
    }
    return body.data as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BREAKING PLATFORM CHANGE (observed 2026-08-10)
//
// Both read endpoints now REQUIRE a `reporter_email` query param and return only
// that reporter's reports. Omitting it is a hard 400:
//   {"code":"VALIDATION_ERROR",
//    "message":"reporter_email is required. This endpoint returns only the bugs
//               submitted by that reporter."}
// It is matched literally — no wildcard (`*` returns 0 rows) — and there is no
// application-wide alternative: GET /api/v1/public/bug-reports is 405 (POST
// only, "Use /api/v1/public/bug-reports/me instead") and no /all, /stats or
// /applications endpoint exists.
//
// SDK v1.3.2's getMyBugReports()/getBugReportById() predate this and send no
// such param, so mirroring them verbatim is what broke. `reporterEmail` is now a
// REQUIRED argument here so a caller cannot reintroduce the 400 by omission.
//
// Because the platform can no longer answer "all reports", the admin console
// lists from our own tms_bug_report_index instead and uses these functions only
// to fetch one known report. See lib/bug-reports/index-row.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reports submitted by ONE reporter. The platform offers no cross-reporter list,
 * so the admin console does NOT call this to build its list — it reads
 * tms_bug_report_index instead. This exists for the SYNC sweep, which asks about
 * one known address at a time (see lib/bug-reports/sync.ts).
 */
export function listBugReportsFor(
  reporterEmail: string,
  limit = 100
): Promise<GetMyBugReportsResponse> {
  const qs = new URLSearchParams({
    reporter_email: reporterEmail.trim().toLowerCase(),
    limit: String(limit),
  });
  return request<GetMyBugReportsResponse>(`/api/v1/public/bug-reports/me?${qs.toString()}`);
}

/** One report + its message thread. `reporterEmail` comes from our index row. */
export function getBugReport(
  id: string,
  reporterEmail: string
): Promise<GetBugReportDetailsResponse> {
  const qs = new URLSearchParams({ reporter_email: reporterEmail.trim().toLowerCase() });
  return request<GetBugReportDetailsResponse>(
    `/api/v1/public/bug-reports/${encodeURIComponent(id)}?${qs.toString()}`
  );
}

// NOTE: currently UNUSED. The platform's /messages insert requires a NOT NULL
// sender_user_id, which our API-key auth (no user identity) cannot supply, so it
// 500s. The admin console now routes replies to the reporter's TMS notification
// inbox instead (see app/api/admin/bug-reports/route.ts handlePost). Kept for
// reference / if the platform later accepts API-key senders.
export function replyToBugReport(id: string, message: string): Promise<unknown> {
  return request(`/api/v1/public/bug-reports/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ bug_report_id: id, message }),
  });
}
