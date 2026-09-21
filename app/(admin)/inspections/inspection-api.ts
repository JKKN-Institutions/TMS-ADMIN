import type { DashboardData, InspectionDetail, InspectionOverview } from '@/lib/inspections/types';
import type { InspectionResult, ItemResult } from '@/lib/inspections/result';
import type { Leg, LearnerOutcome } from '@/lib/inspections/overview';
import type { RosterRow } from '@/lib/booking/roster';

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
export async function fetchOverview(id: string, leg: Leg): Promise<InspectionOverview> {
  return (await json<{ data: InspectionOverview }>(await fetch(`/api/admin/inspections/${id}/overview?leg=${leg}`))).data;
}
export interface RosterData {
  rows: RosterRow[];
  counts: { total: number; present: number; absent: number; unmarked: number; auto: number };
}
/** The same roster the Attendance page and boarding staff screen read (view only here). */
export async function fetchRoster(routeId: string, date: string, leg: Leg): Promise<RosterData> {
  const q = new URLSearchParams({ routeId, date, direction: leg });
  const { data } = await json<{ data: RosterData }>(await fetch(`/api/admin/attendance/roster?${q}`));
  if (!data || !Array.isArray(data.rows) || !data.counts) throw new Error('Could not read the rider roster');
  return { rows: data.rows, counts: data.counts };
}
export async function saveHeadcount(id: string, leg: Leg, counted: number | null) {
  const r = await fetch(`/api/admin/inspections/${id}/headcount`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leg, counted }),
  });
  return (await json<{ data: { counted: number | null; booked: number | null; boarded: number | null } }>(r)).data;
}
export interface LearnerScanResult {
  outcome: LearnerOutcome; name: string | null; roll: string | null;
  onThisRoute: boolean; bookedToday: boolean; boardedToday: boolean; feesOk: boolean; feeLabel: string | null;
}
/** Verify-only JKKN ID check. Camera reads only — a typed card number is refused server-side. */
export async function scanLearner(id: string, code: string): Promise<LearnerScanResult> {
  const r = await fetch(`/api/admin/inspections/${id}/learner-scan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, source: 'camera' }),
  });
  return (await json<{ data: LearnerScanResult }>(r)).data;
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
