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

/** Anything that is not one of the three statuses counts as active. */
export function normalizeDriverStatus(v: unknown): DriverStatus {
  return (STATUSES as readonly unknown[]).includes(v) ? (v as DriverStatus) : 'active';
}

/** Whether the MyJKKN employee record should be active for this driver status. */
export function employeeActiveFor(status: DriverStatus): boolean {
  return status !== 'inactive';
}

type StatusSource = { isActive: boolean; ops: { driverStatus: string } | null };

/** The status to show: an inactive employee is inactive whatever TMS stored. */
export function displayStatus(d: StatusSource): DriverStatus {
  if (!d.isActive) return 'inactive';
  return normalizeDriverStatus(d.ops?.driverStatus);
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
