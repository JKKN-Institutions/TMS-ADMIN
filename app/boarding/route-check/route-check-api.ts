import type { CheckView, MyCheckRoute, ScanResponse, CheckLeg, CheckCounts } from '@/lib/route-check/types';
import type { CheckFineSummary, CheckFinePreview } from '@/lib/route-check/fines';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function fetchMyRoutes(): Promise<MyCheckRoute[]> {
  return (await json<{ data: MyCheckRoute[] }>(await fetch('/api/boarding/route-check/routes', { cache: 'no-store' }))).data;
}
export async function startCheck(routeId: string, leg: CheckLeg): Promise<{ checkId: string; resumed: boolean }> {
  return (await json<{ data: { checkId: string; resumed: boolean } }>(await post('/api/boarding/route-check/start', { routeId, leg }))).data;
}
export async function fetchCheck(checkId: string): Promise<CheckView> {
  return (await json<{ data: CheckView }>(await fetch(`/api/boarding/route-check/${checkId}`, { cache: 'no-store' }))).data;
}
/** Camera reads only — the server refuses anything else. */
export async function scanCode(checkId: string, code: string): Promise<ScanResponse> {
  return (await json<{ data: ScanResponse }>(await post(`/api/boarding/route-check/${checkId}/scan`, { code, source: 'camera' }))).data;
}
export async function pickCandidate(checkId: string, pick: { personKind: 'learner' | 'staff'; id: string; matchedBy: string; scannedCode: string | null }): Promise<ScanResponse> {
  return (await json<{ data: ScanResponse }>(await post(`/api/boarding/route-check/${checkId}/person`, pick))).data;
}
export async function removeEntry(checkId: string, personId: string): Promise<void> {
  await json(await fetch(`/api/boarding/route-check/${checkId}/person?personId=${encodeURIComponent(personId)}`, { method: 'DELETE' }));
}
export async function submitCheck(checkId: string): Promise<{ counts: CheckCounts; fines: CheckFineSummary | null }> {
  return (await json<{ data: { counts: CheckCounts; fines: CheckFineSummary | null } }>(await post(`/api/boarding/route-check/${checkId}/submit`, {}))).data;
}
/** What submitting would fine right now. Advisory: submit re-decides from fresh facts. */
export async function fetchFinePreview(checkId: string): Promise<CheckFinePreview> {
  return (await json<{ data: CheckFinePreview }>(await fetch(`/api/boarding/route-check/${checkId}/fine-preview`, { cache: 'no-store' }))).data;
}
