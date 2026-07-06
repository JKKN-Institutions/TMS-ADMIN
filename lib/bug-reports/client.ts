// Server-only client for the JKKN Bug Reporter platform's PUBLIC REST API.
//
// Mirrors the SDK's internal api client (node_modules/@boobalan_jkkn/
// bug-reporter-sdk/dist/index.mjs) but runs server-side so our admin route can
// proxy it behind withAuth + requirePerm. Endpoints are the SDK's own paths
// (/api/v1/public/...), authed with the X-API-Key header. The PUBLIC API is
// READ + reply only — it exposes no status/assign/delete endpoint — so this
// module intentionally offers just list / detail / reply.

import type {
  GetMyBugReportsResponse,
  GetBugReportDetailsResponse,
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

export interface ListParams {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  search?: string;
}

export function listBugReports(params: ListParams = {}): Promise<GetMyBugReportsResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.status) qs.set('status', params.status);
  if (params.category) qs.set('category', params.category);
  if (params.search) qs.set('search', params.search);
  const q = qs.toString();
  return request<GetMyBugReportsResponse>(`/api/v1/public/bug-reports/me${q ? `?${q}` : ''}`);
}

export function getBugReport(id: string): Promise<GetBugReportDetailsResponse> {
  return request<GetBugReportDetailsResponse>(`/api/v1/public/bug-reports/${encodeURIComponent(id)}`);
}

export function replyToBugReport(id: string, message: string): Promise<unknown> {
  return request(`/api/v1/public/bug-reports/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ bug_report_id: id, message }),
  });
}
