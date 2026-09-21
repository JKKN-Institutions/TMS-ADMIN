import type { DashboardData, InspectionDetail } from '@/lib/inspections/types';
import type { InspectionResult, ItemResult } from '@/lib/inspections/result';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export async function fetchDashboard(): Promise<DashboardData> {
  return (await json<{ data: DashboardData }>(await fetch('/api/admin/inspections'))).data;
}
export async function resolveSticker(code: string) {
  const r = await fetch(`/api/admin/inspections/resolve-sticker?code=${encodeURIComponent(code)}`);
  return (await json<{ data: { vehicleId: string; registration: string; status: string } }>(r)).data;
}
export async function startInspection(vehicleId: string, pos: { lat: number; lng: number } | null) {
  const r = await fetch('/api/admin/inspections/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId, lat: pos?.lat ?? null, lng: pos?.lng ?? null }),
  });
  return (await json<{ data: { inspectionId: string; resumed: boolean } }>(r)).data;
}
export async function fetchInspection(id: string): Promise<InspectionDetail> {
  return (await json<{ data: InspectionDetail }>(await fetch(`/api/admin/inspections/${id}`))).data;
}
export async function saveItems(id: string, items: { id: string; result: ItemResult | null; note: string | null; photoPaths: string[] }[]) {
  await json(await fetch(`/api/admin/inspections/${id}/items`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
  }));
}
export async function submitInspection(id: string, notes: string | null) {
  const r = await fetch(`/api/admin/inspections/${id}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
  });
  return (await json<{ data: { result: InspectionResult } }>(r)).data;
}
export async function uploadPhoto(file: File): Promise<string> {
  const fd = new FormData(); fd.append('file', file);
  return (await json<{ path: string }>(await fetch('/api/admin/inspections/photos', { method: 'POST', body: fd }))).path;
}
/** Best-effort browser location; null when denied/unavailable (never throws). */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
