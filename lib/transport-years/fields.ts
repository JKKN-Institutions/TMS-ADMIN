// lib/transport-years/fields.ts
// Single source of truth for tms_transport_year writable fields + payload
// normalisation. Used by the transport-years API (route.ts) so create/update
// share one code path, and by the create/edit form so the UI and the API agree
// on the field set.

export const TEXT_FIELDS = ['name'] as const; // trimmed or null
export const DATE_FIELDS = ['start_date', 'end_date'] as const; // 'YYYY-MM-DD' or null
export const BOOL_FIELDS = ['is_active', 'is_current'] as const; // coerced to boolean

// Every column the API will write (whitelist). Audit columns (created_by,
// updated_by) and the primary key are set by the route, NOT listed here.
export const EDITABLE: readonly string[] = [
  ...TEXT_FIELDS,
  ...DATE_FIELDS,
  ...BOOL_FIELDS,
];

// Normalise a snake_case request body into a typed tms_transport_year payload.
// Only keys present in the body are included (so PUT can do partial updates).
export function buildTransportYearPayload(
  body: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => k in body;

  for (const k of TEXT_FIELDS) if (has(k)) out[k] = (body[k] as string)?.toString().trim() || null;
  for (const k of DATE_FIELDS) if (has(k)) out[k] = (body[k] as string) || null;
  for (const k of BOOL_FIELDS) if (has(k)) out[k] = !!body[k];

  return out;
}
