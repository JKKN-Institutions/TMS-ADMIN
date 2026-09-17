// lib/passengers/remove-staff.ts
// "Delete" on the Staff passenger page = REMOVE FROM TRANSPORT, never a row delete.
//
// `staff` is MyJKKN's shared HR directory: deleting a row cascades into payroll,
// salaries, bank accounts and HR attendance. So the action only clears the
// transport columns. bus_required = false is also what drops the person's TMS
// access (tms_staff_boarding_eligibility gates on it). Route + stop are cleared
// with it, so re-adding in MyJKKN starts from a clean choice.

export const MAX_REMOVE_STAFF = 200;

export const REMOVE_FROM_TRANSPORT_PATCH = {
  bus_required: false,
  transport_route_id: null,
  transport_stop_id: null,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRemoveStaffIds(body: unknown): { ids: string[] } | { error: string } {
  const raw = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Select at least one staff member' };
  if (!raw.every((v) => typeof v === 'string' && UUID_RE.test(v))) return { error: 'Invalid staff id' };
  const ids = [...new Set(raw as string[])];
  if (ids.length > MAX_REMOVE_STAFF) {
    return { error: `Remove at most ${MAX_REMOVE_STAFF} staff at a time` };
  }
  return { ids };
}
