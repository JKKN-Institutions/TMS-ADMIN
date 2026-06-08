// lib/vehicles/fields.ts
// Single source of truth for tms_vehicle writable fields + payload normalisation.
// Used by the vehicles API (route.ts) so create/update share one code path.

export const ENUM_FIELDS: Record<string, readonly string[]> = {
  vehicle_type: ['bus', 'van', 'car', 'truck', 'ambulance', 'other'],
  ownership_type: ['owned', 'leased', 'rented'],
  fuel_type: ['diesel', 'petrol', 'electric', 'cng'],
  status: ['active', 'maintenance', 'retired'],
};

export const INT_FIELDS = ['capacity', 'model_year', 'maintenance_interval_days'] as const;

export const NUM_FIELDS = [
  'mileage', 'gross_vehicle_weight', 'purchase_cost', 'insurance_amount', 'current_odometer',
  'maintenance_interval_km', 'last_service_odometer', 'next_service_odometer', 'monthly_emi',
  'operating_cost_per_km',
] as const;

export const DATE_FIELDS = [
  'purchase_date', 'warranty_expiry', 'rc_expiry_date', 'permit_expiry_date',
  'pollution_expiry_date', 'road_tax_expiry_date', 'fitness_expiry', 'insurance_expiry',
  'assignment_date', 'last_maintenance', 'next_maintenance', 'fire_extinguisher_expiry',
] as const;

export const BOOL_FIELDS = ['live_tracking_enabled', 'first_aid_available'] as const;

export const UUID_FIELDS = ['gps_device_id', 'assigned_driver_id'] as const;

export const TEXT_FIELDS = [
  'registration_number', 'manufacturer', 'model', 'color', 'vendor_name', 'permit_number',
  'pollution_certificate_number', 'insurance_provider', 'insurance_policy_number',
  'assigned_driver_name', 'gps_provider', 'sim_number', 'service_vendor', 'fuel_card_number',
  'emergency_contact_name', 'emergency_contact_phone', 'chassis_number', 'engine_number',
  'remarks', 'rc_document_url', 'insurance_document_url', 'fitness_certificate_url',
  'permit_document_url',
] as const;

// Every column the API will write (whitelist).
export const EDITABLE: readonly string[] = [
  ...Object.keys(ENUM_FIELDS), ...INT_FIELDS, ...NUM_FIELDS, ...DATE_FIELDS,
  ...BOOL_FIELDS, ...UUID_FIELDS, ...TEXT_FIELDS,
];

// Normalise a snake_case request body into a typed tms_vehicle payload.
// Only keys present in the body are included (so PUT can do partial updates).
export function buildVehiclePayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => k in body;

  for (const k of TEXT_FIELDS) if (has(k)) out[k] = (body[k] as string)?.toString().trim() || null;
  for (const k of Object.keys(ENUM_FIELDS)) {
    if (!has(k)) continue;
    const v = (body[k] as string)?.toString().trim().toLowerCase();
    out[k] = v && ENUM_FIELDS[k].includes(v) ? v : null;
  }
  for (const k of INT_FIELDS) {
    if (!has(k)) continue;
    const n = parseInt(String(body[k]), 10);
    out[k] = Number.isFinite(n) ? n : null;
  }
  for (const k of NUM_FIELDS) {
    if (!has(k)) continue;
    const n = parseFloat(String(body[k]));
    out[k] = Number.isFinite(n) ? n : null;
  }
  for (const k of DATE_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;
  for (const k of UUID_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;
  for (const k of BOOL_FIELDS) if (has(k)) out[k] = !!body[k];

  // status / fuel_type default to a valid value on create rather than null.
  if (has('status') && out.status == null) out.status = 'active';
  if (has('fuel_type') && out.fuel_type == null) out.fuel_type = 'diesel';
  // capacity defaults to 0 (matches NOT NULL default) rather than null.
  if (has('capacity') && out.capacity == null) out.capacity = 0;
  // mileage column is NOT NULL default 0.
  if (has('mileage') && out.mileage == null) out.mileage = 0;

  return out;
}
