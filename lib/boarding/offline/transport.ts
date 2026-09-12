/** The outbox's two requests. `fetch` rejects only when no response arrives. */
import type { MarksBody, PostResult, ScanBody } from './sync';

async function post(url: string, body: unknown): Promise<PostResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export const postMarks = (body: MarksBody) => post('/api/boarding/attendance', body);
export const postScan = (body: ScanBody) => post('/api/boarding/scan', body);
