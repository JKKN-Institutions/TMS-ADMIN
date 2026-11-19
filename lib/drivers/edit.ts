/**
 * Server-side orchestration for editing an EXISTING driver in the `staff` table
 * shared with MyJKKN, and for replacing the driver's photo. Takes the
 * service-role client as a parameter and does no auth itself: the route owns
 * auth, permission and activity logging. This client bypasses MyJKKN's own
 * guards, so the guards here are the only ones.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { canFullEdit, diffStaffPatch, validatePerson } from './staff-fields';
import { translateStaffDbError } from './db-errors';
import { buildTransportPayload } from './map';
import { ensureDriverRole, findExistingAccount, OnboardError } from './onboard';
import { DRIVER_CATEGORY_ID, DRIVER_ROLE_KEY, STAFF_IMAGE_BUCKET } from './onboarding-constants';

export const EXISTING_EMAIL_MESSAGE = 'This email already belongs to someone in MyJKKN.';
export const RECORD_MANAGED_ELSEWHERE_MESSAGE = "This person's record is managed in MyJKKN.";
export const PHOTO_MANAGED_ELSEWHERE_MESSAGE = "This person's photo is managed in MyJKKN.";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

async function loadDriverRow(svc: SupabaseClient, driverId: string): Promise<Record<string, unknown>> {
  const { data, error } = await svc
    .from('staff')
    .select('*')
    .eq('id', driverId)
    .eq('role_key', DRIVER_ROLE_KEY)
    .maybeSingle();
  if (error) {
    console.error('Driver edit: staff lookup failed:', error);
    throw new OnboardError({ status: 500, error: 'Failed to look up the driver.' });
  }
  if (!data) throw new OnboardError({ status: 404, error: 'Driver not found' });
  return data as Record<string, unknown>;
}

function rowIsFullyEditable(row: Record<string, unknown>): boolean {
  return canFullEdit({
    role_key: (row.role_key as string | null) ?? null,
    category_id: (row.category_id as string | null) ?? null,
  });
}

export interface UpdateDriverResult {
  id: string;
  personSaved: boolean;
  changed: string[];
}

/**
 * Update a driver's staff columns (only when the whole record is TMS-editable) and
 * always upsert the TMS-owned `tms_driver` row. Throws OnboardError for 404 / 400 /
 * 409 and translated database errors.
 */
export async function updateDriver(
  svc: SupabaseClient,
  driverId: string,
  body: { person?: unknown; transport?: unknown },
  actorId: string,
): Promise<UpdateDriverResult> {
  const row = await loadDriverRow(svc, driverId);
  const profileId = (row.profile_id as string | null) ?? null;

  // A missing transport object would blank the licence: refuse rather than default to {}.
  if (!isPlainObject(body.transport)) {
    throw new OnboardError({ status: 400, error: 'Transport details are missing' });
  }
  const transport = body.transport;

  const editPerson = rowIsFullyEditable(row) && body.person !== undefined && body.person !== null;
  let patch: Record<string, unknown> = {};

  if (editPerson) {
    const checked = validatePerson(body.person, 'edit');
    if (!checked.ok) {
      throw new OnboardError({ status: 400, error: 'Check the highlighted fields.', fields: checked.errors });
    }
    patch = diffStaffPatch(checked.value, row) as Record<string, unknown>;
    if (typeof patch.email === 'string') {
      const existing = await findExistingAccount(svc, [patch.email], {
        staffId: driverId,
        profileId: profileId ?? undefined,
      });
      if (existing) throw new OnboardError({ status: 409, error: EXISTING_EMAIL_MESSAGE, field: 'email' });
    }
  }

  const changed = Object.keys(patch);
  if (changed.length > 0) {
    // Re-assert the gate inside the write: the row may have moved category since the read.
    const { data: updated, error } = await svc
      .from('staff')
      .update({ ...patch, updated_by: actorId })
      .eq('id', driverId)
      .eq('role_key', DRIVER_ROLE_KEY)
      .eq('category_id', DRIVER_CATEGORY_ID)
      .select('id');
    if (error) {
      console.error('Driver edit: staff update failed:', error);
      throw new OnboardError(translateStaffDbError(error));
    }
    if (!updated || updated.length === 0) {
      throw new OnboardError({ status: 403, error: RECORD_MANAGED_ELSEWHERE_MESSAGE });
    }
  }

  // Address and emergency contact have one home, the staff row. The form pre-filled
  // them from the old tms_driver copy, so once the person is saved that copy goes.
  // Runs only after the staff update succeeded: a failed update throws above.
  const clearOldCopies = editPerson
    ? { address: null, emergency_contact_name: null, emergency_contact_phone: null }
    : {};

  const { error: opsErr } = await svc
    .from('tms_driver')
    .upsert(
      { ...buildTransportPayload(driverId, transport), ...clearOldCopies, profile_id: profileId, updated_by: actorId },
      { onConflict: 'staff_id' },
    );
  if (opsErr) {
    console.error('Driver edit: tms_driver upsert failed:', opsErr);
    throw new OnboardError({ status: 500, error: 'Failed to save transport details' });
  }

  // Best effort: completes a create that warned. Never fails the edit.
  if (profileId) {
    try {
      await ensureDriverRole(svc, profileId, actorId);
    } catch (e) {
      console.error('Driver edit: ensureDriverRole failed (ignored):', e);
    }
  }

  return { id: driverId, personSaved: editPerson, changed };
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif']);
const MIME_EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };

/** `<staffId>/<now>.<ext>`; ext is jpg, jpeg, png or gif (from the name, else the MIME type, else jpg). */
export function photoObjectPath(staffId: string, fileName: string, now: number, mimeType?: string): string {
  const dot = fileName.lastIndexOf('.');
  const fromName = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const ext = IMAGE_EXTENSIONS.has(fromName) ? fromName : (MIME_EXTENSIONS[mimeType ?? ''] ?? 'jpg');
  return `${staffId}/${now}.${ext}`;
}

/**
 * Replace the driver's photo: upload the new object, point staff.profile_picture at
 * it, then remove the older objects under `<staffId>/` (never the new one). Older
 * objects go last so a failed update cannot leave the row pointing at a deleted file.
 */
export async function replaceDriverPhoto(
  svc: SupabaseClient,
  driverId: string,
  file: { bytes: ArrayBuffer | Uint8Array; name: string; type: string },
  actorId: string,
  now: number,
): Promise<{ url: string }> {
  const row = await loadDriverRow(svc, driverId);
  if (!rowIsFullyEditable(row)) {
    throw new OnboardError({ status: 403, error: PHOTO_MANAGED_ELSEWHERE_MESSAGE });
  }

  const bucket = svc.storage.from(STAFF_IMAGE_BUCKET);
  const path = photoObjectPath(driverId, file.name, now, file.type);

  const { error: uploadErr } = await bucket.upload(path, file.bytes, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadErr) {
    console.error('Driver photo upload failed:', uploadErr);
    throw new OnboardError({ status: 500, error: 'Failed to upload the photo.' });
  }

  const url = bucket.getPublicUrl(path).data?.publicUrl;
  if (!url) {
    await bucket.remove([path]).catch(() => undefined);
    throw new OnboardError({ status: 500, error: 'Failed to upload the photo.' });
  }

  const { data: updated, error: updateErr } = await svc
    .from('staff')
    .update({ profile_picture: url, updated_by: actorId })
    .eq('id', driverId)
    .eq('role_key', DRIVER_ROLE_KEY)
    .eq('category_id', DRIVER_CATEGORY_ID)
    .select('id');
  if (updateErr) {
    console.error('Driver photo: staff update failed:', updateErr);
    await bucket.remove([path]).catch(() => undefined);
    throw new OnboardError(translateStaffDbError(updateErr));
  }
  if (!updated || updated.length === 0) {
    // The row left the gate after the read: keep its existing photo, drop only the new object.
    await bucket.remove([path]).catch(() => undefined);
    throw new OnboardError({ status: 403, error: PHOTO_MANAGED_ELSEWHERE_MESSAGE });
  }

  try {
    const { data: existing, error: listErr } = await bucket.list(driverId);
    if (listErr) throw listErr;
    const stale = (existing ?? []).map((o) => `${driverId}/${o.name}`).filter((p) => p !== path);
    if (stale.length > 0) {
      const { error: removeErr } = await bucket.remove(stale);
      if (removeErr) throw removeErr;
    }
  } catch (e) {
    console.error('Driver photo: could not remove old photos (ignored):', e);
  }

  return { url };
}
