/**
 * Readable names for the `entity_type` values written to tms_activity_log.
 * The log stores raw table names ("tms_fee_fine"); admins should read
 * "Transport Fee". Unknown types fall back to a tidied version of the name.
 */
const ENTITY_NAMES: Record<string, string> = {
  tms_attendance: 'Attendance mark',
  tms_attendance_window: 'Attendance window',
  tms_booking: 'Booking',
  tms_driver: 'Driver',
  tms_driver_mobile: 'Tracking mobile',
  tms_fee_fine: 'Transport Fee',
  tms_fee_override: 'Fee override',
  tms_fee_structure: 'Maintenance fee structure',
  tms_fee_structure_stop_rate: 'Stop fee rate',
  tms_fine_stop_rate: 'Transport Fee stop rate',
  tms_incharge_absence: 'In-charge absence',
  tms_inspection: 'Bus inspection',
  tms_notification: 'Notification',
  tms_route: 'Route',
  tms_route_check: 'Bus inspection',
  tms_route_check_person: 'Inspected passenger',
  tms_route_checker_assignment: 'Inspector assignment',
  tms_route_optimization: 'Route optimization run',
  tms_route_stop: 'Route stop',
  tms_staff_route_assignment: 'Staff route assignment',
  tms_transport_vacate_request: 'Transport vacate request',
  tms_transport_year: 'Transport year',
  tms_trip: 'Bus trip',
  tms_vehicle: 'Vehicle',
  admin_settings: 'Setting',
  billing_student_bills: 'Bill',
  fee_bill: 'Bill',
  learners_profiles: 'Learner',
  notification: 'Notification',
  route: 'Route',
  staff: 'Staff member',
};

export function entityName(type: string | null | undefined): string {
  if (!type) return '';
  return (
    ENTITY_NAMES[type] ??
    type
      .replace(/^tms_/, '')
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase())
  );
}

/** What the Entity column shows: the stored label, else "<Type> #<short id>". */
export function entityDisplay(r: { entity_label: string | null; entity_type: string | null; entity_id: string | null }): string {
  if (r.entity_label) return r.entity_label;
  const name = entityName(r.entity_type);
  if (!name) return '';
  return r.entity_id ? `${name} #${r.entity_id.slice(0, 8)}` : name;
}
