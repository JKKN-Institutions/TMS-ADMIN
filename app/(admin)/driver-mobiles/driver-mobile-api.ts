import type { DriverMobileRow } from './columns';

export async function fetchDriverMobile(id: string): Promise<DriverMobileRow> {
  const res = await fetch(`/api/admin/driver-mobiles/${id}`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load driver mobile');
  return json.data as DriverMobileRow;
}

export interface DriverOption {
  id: string;   // staff id — matches tms_driver.staff_id (the FK target)
  name: string;
  phone: string | null;
}

// Drivers come from /api/admin/drivers (mapped from `staff`). Only those WITH a
// tms_driver ops row (`ops != null`) can be assigned — the mobile FK targets
// tms_driver(staff_id), so a staffer without an ops row would fail the FK.
export async function fetchDriverOptions(): Promise<DriverOption[]> {
  const res = await fetch('/api/admin/drivers', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load drivers');
  return (json.data as { id: string; name: string; phone: string | null; ops: unknown }[])
    .filter((d) => d.ops != null)
    .map((d) => ({ id: d.id, name: d.name, phone: d.phone ?? null }));
}
