/**
 * Shared GPS-device row shape + a hardened single-device fetch helper.
 * Kept free of 'use client' / table deps so both the columns file and the
 * View/Edit pages can import the type and the fetcher without coupling.
 */
export interface GpsDevice {
  id: string;
  device_id: string;
  device_name: string;
  device_model: string | null;
  sim_number: string | null;
  imei: string | null;
  notes: string | null;
  status: string | null;
  battery_level: number | null;
  signal_strength: number | null;
  last_heartbeat: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export async function fetchGpsDevice(id: string): Promise<GpsDevice> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/gps/devices/${id}`, { cache: 'no-store', credentials: 'same-origin' });
  } catch (e) {
    throw new Error(`Could not reach the GPS device API: ${(e as Error).message}`);
  }

  let json: { success?: boolean; error?: string; data?: GpsDevice };
  try {
    json = await res.json();
  } catch {
    throw new Error(`GPS device API returned a non-JSON response (HTTP ${res.status}).`);
  }

  if (!res.ok || !json.success || !json.data) {
    throw new Error(`${json.error || 'Failed to load GPS device'} (HTTP ${res.status})`);
  }
  return json.data;
}
