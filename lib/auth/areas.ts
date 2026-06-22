// Maps requests to a dashboard "area" and decides where each role lands.
// Pure functions — no I/O — so they're reusable in proxy.ts, the OAuth callback,
// and client guards without pulling in server-only deps.

export type Area = 'admin' | 'student' | 'driver' | 'boarding';

/** Resolve a pathname (page or /api/*) to its area. Admin owns the root URLs. */
export function resolveArea(pathname: string): Area {
  if (pathname === '/student' || pathname.startsWith('/student/') || pathname.startsWith('/api/student/')) return 'student';
  if (pathname === '/driver' || pathname.startsWith('/driver/') || pathname.startsWith('/api/driver/')) return 'driver';
  if (pathname === '/boarding' || pathname.startsWith('/boarding/') || pathname.startsWith('/api/boarding/')) return 'boarding';
  return 'admin';
}

/** The single permission that grants entry to each area. */
export const AREA_PERMISSION: Record<Area, string> = {
  admin: 'tms.dashboard.view',
  student: 'tms.passenger.self.view',
  driver: 'tms.driver.self.view',
  boarding: 'tms.attendance.scan',
};

/** Where a freshly-authenticated user should land, by role. */
export function resolveHomeForRole(role: string, isSuperAdmin: boolean): string {
  if (isSuperAdmin) return '/dashboard';
  if (role === 'student') return '/student/dashboard';
  if (role === 'driver') return '/driver/dashboard';
  return '/dashboard';
}
