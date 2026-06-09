// Shared transport-grievance categories (matches the tms_grievance CHECK).
export const GRIEVANCE_CATEGORIES = [
  { value: 'bus_delay', label: 'Bus delay' },
  { value: 'driver_behaviour', label: 'Driver behaviour' },
  { value: 'vehicle_condition', label: 'Vehicle condition' },
  { value: 'route_issue', label: 'Route issue' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'payment', label: 'Payment' },
  { value: 'other', label: 'Other' },
] as const;

export const GRIEVANCE_CATEGORY_VALUES = GRIEVANCE_CATEGORIES.map((c) => c.value) as string[];

export function grievanceCategoryLabel(value: string): string {
  return GRIEVANCE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
