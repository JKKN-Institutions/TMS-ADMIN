/**
 * The one rule tying a driver's TMS status to the employee record shared with
 * MyJKKN. Pure: safe to import from server code and from 'use client' screens.
 *
 * A driver has ONE status. Inactive means the employee is inactive in MyJKKN
 * (`staff.is_active = false`); Active and On leave mean the employee is active.
 */
export type DriverStatus = 'active' | 'on_leave' | 'inactive';

const STATUSES: readonly DriverStatus[] = ['active', 'on_leave', 'inactive'];

export const STATUS_LABEL: Record<DriverStatus, string> = {
  active: 'Active',
  on_leave: 'On leave',
  inactive: 'Inactive',
};

export function isDriverStatus(v: unknown): v is DriverStatus {
  return (STATUSES as readonly unknown[]).includes(v);
}

/** Anything that is not one of the three statuses counts as active. */
export function normalizeDriverStatus(v: unknown): DriverStatus {
  return isDriverStatus(v) ? v : 'active';
}

/** Whether the MyJKKN employee record should be active for this driver status. */
export function employeeActiveFor(status: DriverStatus): boolean {
  return status !== 'inactive';
}

type StatusSource = {
  isActive: boolean;
  /** True when TMS owns the whole record (a driver in the Driver category). */
  canFullEdit?: boolean;
  ops: { driverStatus: string } | null;
};

/**
 * The status to show. The employee flag is the authority: an inactive employee is
 * inactive whatever TMS stored, and for a record TMS owns an ACTIVE employee is
 * never shown as inactive because of a stale TMS value (for example after MyJKKN
 * made them active again). Only a record managed in MyJKKN keeps a TMS-only inactive.
 */
export function displayStatus(d: StatusSource): DriverStatus {
  if (!d.isActive) return 'inactive';
  const stored = normalizeDriverStatus(d.ops?.driverStatus);
  return stored === 'inactive' && d.canFullEdit ? 'active' : stored;
}

/** Whether this driver may be offered in a "choose a driver" list. */
export function isAssignable(d: StatusSource): boolean {
  return displayStatus(d) !== 'inactive';
}

/**
 * The drivers to offer in a "choose a driver" list: everyone who is not inactive,
 * plus the one already chosen (so an old choice still shows, labelled as inactive).
 */
export function driverChoices<T extends StatusSource & { id: string; name: string }>(
  drivers: T[],
  currentId?: string | null,
): (T & { label: string })[] {
  return drivers
    .filter((d) => isAssignable(d) || (!!currentId && d.id === currentId))
    .map((d) => ({ ...d, label: isAssignable(d) ? d.name : `${d.name} (inactive)` }));
}
