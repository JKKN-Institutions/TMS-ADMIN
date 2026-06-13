// lib/fees/fields.ts
// Single source of truth for tms_fee_structure writable fields + payload
// normalisation. Used by the fees API (route.ts) and mirrored by the form so the
// UI and API agree on the field set. Terms (tms_fee_structure_term) are written
// separately — see the route's term-replacement logic.

export const TEXT_FIELDS = ['name', 'notes'] as const;          // trimmed or null
export const ENUM_FIELDS = ['audience', 'status'] as const;     // validated by DB CHECK
export const UUID_FIELDS = [                                     // '' -> null = "any"
  'transport_year_id', 'institution_id', 'degree_id',
  'department_id', 'programme_id', 'semester_id', 'quota_id',
] as const;
export const NUM_FIELDS = ['total_amount', 'split_count'] as const;

// Every column the API will write (whitelist). Audit columns (created_by,
// updated_by), the PK, and child term rows are NOT listed here.
export const EDITABLE: readonly string[] = [
  ...TEXT_FIELDS, ...ENUM_FIELDS, ...UUID_FIELDS, ...NUM_FIELDS, 'staff_role_keys',
];

// Normalise a snake_case body into a typed tms_fee_structure payload. Only keys
// present in the body are included (so PUT does partial updates).
export function buildFeeStructurePayload(
  body: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => k in body;

  for (const k of TEXT_FIELDS) if (has(k)) out[k] = (body[k] as string)?.toString().trim() || null;
  for (const k of ENUM_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;
  for (const k of UUID_FIELDS) if (has(k)) out[k] = (body[k] as string) || null; // '' -> null ("any")
  for (const k of NUM_FIELDS) if (has(k)) out[k] = body[k] == null || body[k] === '' ? null : Number(body[k]);
  if (has('staff_role_keys')) {
    const v = body['staff_role_keys'];
    out['staff_role_keys'] = Array.isArray(v) && v.length ? v.map(String) : null;
  }

  return out;
}
