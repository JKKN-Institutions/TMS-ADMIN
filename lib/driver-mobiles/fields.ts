// lib/driver-mobiles/fields.ts
// Single source of truth for tms_driver_mobile writable fields + payload
// normalisation. Used by the driver-mobiles API so create/update share one path.

import { normalizeImagePaths } from './images';

// Private Supabase Storage bucket holding phone photos. Shared by every route
// that uploads or signs a driver-mobile image, so the string lives in one place.
export const DRIVER_MOBILE_IMAGE_BUCKET = 'tms-driver-mobile-images';

export const ENUM_FIELDS: Record<string, readonly string[]> = {
  status: ['assigned', 'returned', 'damaged', 'lost'],
  condition: ['new', 'used', 'refurbished'],
};

export const NUM_FIELDS = ['purchase_cost'] as const;

export const DATE_FIELDS = ['supplied_date', 'purchase_date', 'warranty_expiry', 'handover_date'] as const;

export const UUID_FIELDS = ['driver_staff_id', 'route_id'] as const;

export const TEXT_FIELDS = [
  'brand', 'model', 'color', 'imei', 'notes',
  'sim_number', 'phone_number', 'network_provider',
  'supplier_name', 'invoice_number',
  'storage_capacity', 'serial_number', 'accessories',
  'handover_by',
] as const;

// Array-valued columns. Mirrors lib/fees/fields.ts's ARRAY_FIELDS convention.
export const ARRAY_FIELDS = ['image_paths'] as const;

// Every column the API will write (whitelist).
export const EDITABLE: readonly string[] = [
  ...Object.keys(ENUM_FIELDS), ...NUM_FIELDS, ...DATE_FIELDS, ...UUID_FIELDS, ...TEXT_FIELDS,
  ...ARRAY_FIELDS,
];

// Normalise a snake_case request body into a typed tms_driver_mobile payload.
// Only keys present in the body are included (so PUT can do partial updates).
export function buildDriverMobilePayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => k in body;

  for (const k of TEXT_FIELDS) if (has(k)) out[k] = (body[k] as string)?.toString().trim() || null;
  for (const k of Object.keys(ENUM_FIELDS)) {
    if (!has(k)) continue;
    const v = (body[k] as string)?.toString().trim().toLowerCase();
    out[k] = v && ENUM_FIELDS[k].includes(v) ? v : null;
  }
  for (const k of NUM_FIELDS) {
    if (!has(k)) continue;
    const n = parseFloat(String(body[k]));
    out[k] = Number.isFinite(n) ? n : null;
  }
  for (const k of DATE_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;
  for (const k of UUID_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;
  for (const k of ARRAY_FIELDS) if (has(k)) out[k] = normalizeImagePaths(body[k]);

  // status defaults to 'assigned' on create rather than null (matches DB default).
  // The column is NOT NULL default 'assigned', so the builder must NEVER emit
  // status: null — any present-but-empty OR invalid status coerces to 'assigned'.
  if (has('status') && out.status == null) out.status = 'assigned';

  return out;
}
