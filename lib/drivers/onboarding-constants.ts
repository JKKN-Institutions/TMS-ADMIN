/**
 * Fixed values for onboarding a driver into the `staff` table shared with MyJKKN.
 */
export const DRIVER_INSTITUTION_ID = 'b962527f-97ce-4238-89ce-7b532d7c2bc6';
export const DRIVER_CATEGORY_ID = '42e1232f-3a16-4399-9543-e0586357caed';
export const DRIVER_ROLE_KEY = 'driver';
export const INSTITUTION_EMAIL_SUFFIX = '@jkkn.ac.in';
export const STAFF_IMAGE_BUCKET = 'staff-images';

export const GENDERS = ['male', 'female', 'bigender'] as const;
export const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widow'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A1+', 'A1B'] as const;
export const RELATIONSHIPS = [
  'Father', 'Mother', 'Spouse', 'Brother', 'Sister', 'Son', 'Daughter', 'Guardian', 'Friend', 'Other',
] as const;

/** True only for staff rows that are drivers in the Driver category (full record editable). */
export function canFullEdit(row: { role_key: string | null; category_id: string | null }): boolean {
  return row.role_key === DRIVER_ROLE_KEY && row.category_id === DRIVER_CATEGORY_ID;
}
