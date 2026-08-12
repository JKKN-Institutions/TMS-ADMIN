/**
 * TMS permission keys. These mirror the keys seeded into MyJKKN's custom_roles
 * permission catalog (see supabase/migrations/*_add_tms_permission_keys.sql) and
 * are checked via the shared user_has_permission() / get_user_merged_permissions()
 * functions. Always reference these constants instead of raw strings.
 */
export const TMS_PERMISSIONS = {
  DASHBOARD_VIEW: 'tms.dashboard.view',

  ROUTES_VIEW: 'tms.routes.view',
  ROUTES_CREATE: 'tms.routes.create',
  ROUTES_EDIT: 'tms.routes.edit',
  ROUTES_DELETE: 'tms.routes.delete',

  VEHICLES_VIEW: 'tms.vehicles.view',
  VEHICLES_CREATE: 'tms.vehicles.create',
  VEHICLES_EDIT: 'tms.vehicles.edit',
  VEHICLES_DELETE: 'tms.vehicles.delete',

  DRIVERS_VIEW: 'tms.drivers.view',
  DRIVERS_ASSIGN: 'tms.drivers.assign',
  DRIVERS_MANAGE: 'tms.drivers.manage',

  SCHEDULES_VIEW: 'tms.schedules.view',
  SCHEDULES_CREATE: 'tms.schedules.create',
  SCHEDULES_EDIT: 'tms.schedules.edit',
  SCHEDULES_DELETE: 'tms.schedules.delete',

  BOOKINGS_VIEW: 'tms.bookings.view',
  BOOKINGS_VIEW_ALL: 'tms.bookings.view_all',
  BOOKINGS_CREATE: 'tms.bookings.create',
  BOOKINGS_MANAGE: 'tms.bookings.manage',
  BOOKINGS_SELF: 'tms.bookings.self',

  ATTENDANCE_VIEW: 'tms.attendance.view',
  ATTENDANCE_SCAN: 'tms.attendance.scan',
  ATTENDANCE_MANAGE: 'tms.attendance.manage',

  TRACKING_VIEW: 'tms.tracking.view',
  TRACKING_SHARE: 'tms.tracking.share',
  TRACKING_TRIP_MANAGE: 'tms.tracking.trip.manage',

  GRIEVANCES_SUBMIT: 'tms.grievances.submit',
  GRIEVANCES_VIEW: 'tms.grievances.view',
  GRIEVANCES_MANAGE: 'tms.grievances.manage',

  REPORTS_VIEW: 'tms.reports.view',
  REPORTS_EXPORT: 'tms.reports.export',

  SETTINGS_VIEW: 'tms.settings.view',
  SETTINGS_MANAGE: 'tms.settings.manage',

  ENROLLMENT_VIEW: 'tms.enrollment.view',
  ENROLLMENT_MANAGE: 'tms.enrollment.manage',

  // Learner / Passenger self-service (seeded on the `student` role). Pass-based +
  // admin-recorded payments (confirmed v1): learner VIEWS payment status (admin
  // records it), so payment is `.view`, not `.pay`. No per-trip booking key.
  PASSENGER_SELF_VIEW: 'tms.passenger.self.view',
  PASSENGER_PAYMENT_VIEW: 'tms.passenger.payment.view',
  PASSENGER_ENROLL: 'tms.passenger.enrollment.request',

  // Driver self-service (seeded on the `driver` role) — read-only shell in v1.
  DRIVER_SELF_VIEW: 'tms.driver.self.view',

  // Admin activity log (read-only module; entries are written server-side).
  ACTIVITY_VIEW: 'tms.activity.view',

  TRANSPORT_YEARS_VIEW: 'tms.transport_years.view',
  TRANSPORT_YEARS_CREATE: 'tms.transport_years.create',
  TRANSPORT_YEARS_EDIT: 'tms.transport_years.edit',
  TRANSPORT_YEARS_DELETE: 'tms.transport_years.delete',

  // Transport fees structures + bill generation.
  FEES_VIEW: 'tms.fees.view',
  FEES_CREATE: 'tms.fees.create',
  FEES_EDIT: 'tms.fees.edit',
  FEES_DELETE: 'tms.fees.delete',
  FEES_GENERATE: 'tms.fees.generate',

  // Transport notifications module. View = admin list/detail; Send = compose &
  // broadcast; Manage = delete/expire. Consumers read their OWN inbox with no
  // extra permission (own-row RLS on tms_notification_recipient).
  NOTIFICATIONS_VIEW: 'tms.notifications.view',
  NOTIFICATIONS_SEND: 'tms.notifications.send',
  NOTIFICATIONS_MANAGE: 'tms.notifications.manage',

  // Driver mobile supply — physical phones supplied to drivers.
  DRIVER_MOBILES_VIEW: 'tms.driver_mobiles.view',
  DRIVER_MOBILES_CREATE: 'tms.driver_mobiles.create',
  DRIVER_MOBILES_EDIT: 'tms.driver_mobiles.edit',
  DRIVER_MOBILES_DELETE: 'tms.driver_mobiles.delete',

  // Student transport vacate — request to leave the bus + transport-head approval
  // that cancels the current-year bill.
  VACATE_VIEW: 'tms.vacate.view',
  VACATE_MANAGE: 'tms.vacate.manage',
} as const;

export type TmsPermissionKey =
  (typeof TMS_PERMISSIONS)[keyof typeof TMS_PERMISSIONS];
