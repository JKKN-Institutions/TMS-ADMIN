/**
 * Server-side orchestration for onboarding a NEW driver into the `staff` table
 * shared with MyJKKN. Takes the service-role client as a parameter and does no
 * auth itself: the route owns auth, permission and activity logging.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildStaffInsert, normalizeEmail, type DriverPersonInput, type FieldErrors } from './staff-fields';
import { translateStaffDbError } from './db-errors';
import { buildTransportPayload } from './map';
import { DRIVER_CATEGORY_ID, DRIVER_INSTITUTION_ID, DRIVER_ROLE_KEY } from './onboarding-constants';

export const EXISTING_ACCOUNT_MESSAGE =
  'This email already belongs to someone in MyJKKN. Use "Existing staff member" to make them a driver, or ask HR.';
export const PERSONAL_EMAIL_TAKEN_MESSAGE = 'This personal email already belongs to someone in MyJKKN.';
export const TRANSPORT_NOT_SAVED_WARNING =
  'The team member record was created, but the transport details were not saved. Open Edit and save again.';

/** A refusal the route turns into a JSON response. */
export class OnboardError extends Error {
  status: number;
  field?: keyof DriverPersonInput;
  fields?: FieldErrors;
  constructor(init: { status: number; error: string; field?: keyof DriverPersonInput; fields?: FieldErrors }) {
    super(init.error);
    this.name = 'OnboardError';
    this.status = init.status;
    this.field = init.field;
    this.fields = init.fields;
  }
}

export interface OnboardResult {
  id: string;
  staffCode: string | null;
  warning?: string;
}

/** Escape `\`, `%` and `_` so an email is matched literally by ilike. */
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Where a duplicate was found, and which of the given emails (normalised) it matched. */
export interface ExistingAccountHit {
  where: 'staff' | 'profile';
  email: string;
}

/**
 * Does any staff row (email / institution_email) or profile (email) already use one
 * of these emails? Case-insensitive, literal match. `exclude` skips one staff row and
 * one profile row (the person being edited). A failed lookup throws: never fail open.
 */
export async function findExistingAccount(
  svc: SupabaseClient,
  emails: string[],
  exclude: { staffId?: string; profileId?: string } = {},
): Promise<ExistingAccountHit | null> {
  const list = [...new Set(emails.map((e) => normalizeEmail(e ?? '')).filter((e) => e !== ''))];
  if (list.length === 0) return null;

  const lookups: { table: 'staff' | 'profiles'; column: string; hit: 'staff' | 'profile'; skipId?: string }[] = [
    { table: 'staff', column: 'email', hit: 'staff', skipId: exclude.staffId },
    { table: 'staff', column: 'institution_email', hit: 'staff', skipId: exclude.staffId },
    { table: 'profiles', column: 'email', hit: 'profile', skipId: exclude.profileId },
  ];

  for (const l of lookups) {
    for (const email of list) {
      let q = svc.from(l.table).select('id').ilike(l.column, escapeIlike(email));
      if (l.skipId) q = q.neq('id', l.skipId);
      const { data, error } = await q.limit(1);
      if (error) {
        console.error('Existing-account lookup failed:', error);
        throw new OnboardError({ status: 500, error: 'Could not check whether this email is already in use.' });
      }
      if (data && data.length > 0) return { where: l.hit, email };
    }
  }
  return null;
}

/**
 * Give the profile the Driver role only when it has no role at all. Never deletes or
 * changes an existing user_roles row.
 */
export async function ensureDriverRole(svc: SupabaseClient, profileId: string, actorId: string): Promise<void> {
  const { data: role, error: roleErr } = await svc
    .from('custom_roles')
    .select('id')
    .eq('role_key', DRIVER_ROLE_KEY)
    .maybeSingle();
  if (roleErr) throw roleErr;
  if (!role) throw new Error('The driver role is not set up in MyJKKN.');

  const { data: existing, error: existingErr } = await svc
    .from('user_roles')
    .select('id')
    .eq('user_id', profileId)
    .limit(1);
  if (existingErr) throw existingErr;
  if (existing && existing.length > 0) return;

  const { error } = await svc
    .from('user_roles')
    .insert({ user_id: profileId, role_id: (role as { id: string }).id, is_primary: true, assigned_by: actorId });
  if (error) throw error;
}

/** `person` must already have passed validatePerson(..., 'create'). */
export async function onboardDriver(
  svc: SupabaseClient,
  person: DriverPersonInput,
  transport: Record<string, unknown>,
  actorId: string,
): Promise<OnboardResult> {
  const row = buildStaffInsert(person, actorId);

  const existing = await findExistingAccount(svc, [row.institution_email, row.email]);
  if (existing) {
    // row.email falls back to the institution email when no personal email was given.
    if (existing.email === normalizeEmail(row.institution_email)) {
      throw new OnboardError({ status: 409, error: EXISTING_ACCOUNT_MESSAGE, field: 'institutionEmailName' });
    }
    throw new OnboardError({ status: 409, error: PERSONAL_EMAIL_TAKEN_MESSAGE, field: 'email' });
  }

  const [inst, cat] = await Promise.all([
    svc.from('institutions').select('id').eq('id', DRIVER_INSTITUTION_ID).maybeSingle(),
    svc.from('employment_categories').select('id').eq('id', DRIVER_CATEGORY_ID).maybeSingle(),
  ]);
  if (inst.error || cat.error || !inst.data || !cat.data) {
    throw new OnboardError({ status: 500, error: 'Driver institution/category is not set up in MyJKKN.' });
  }

  const { data: created, error: insertErr } = await svc
    .from('staff')
    .insert(row)
    .select('id, staff_id, profile_id')
    .single();
  if (insertErr || !created) {
    console.error('Onboard driver staff insert error:', insertErr);
    throw new OnboardError(translateStaffDbError(insertErr ?? {}));
  }
  const staff = created as { id: string; staff_id: string | null; profile_id: string | null };

  // From here the staff row exists and must never be deleted: failures become a warning.
  let warning: string | undefined;
  try {
    const { error: opsErr } = await svc
      .from('tms_driver')
      .upsert(
        { ...buildTransportPayload(staff.id, transport), profile_id: staff.profile_id, created_by: actorId, updated_by: actorId },
        { onConflict: 'staff_id' },
      );
    if (opsErr) throw opsErr;
    if (!staff.profile_id) throw new Error('The new staff row has no profile_id.');
    await ensureDriverRole(svc, staff.profile_id, actorId);
  } catch (e) {
    console.error('Onboard driver follow-up failed (staff row kept):', e);
    warning = TRANSPORT_NOT_SAVED_WARNING;
  }

  return { id: staff.id, staffCode: staff.staff_id, ...(warning ? { warning } : {}) };
}
