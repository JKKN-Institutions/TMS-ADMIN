'use client';

import { usePermissions } from '@/hooks/use-permissions';

interface PermissionGuardProps {
  /** A single permission key or a list. */
  permission: string | string[];
  /** true = user must have ALL listed permissions; false (default) = ANY. */
  requireAll?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on TMS permissions. Super admins always
 * pass. While permissions load, renders nothing (avoids a flash of gated UI).
 */
export function PermissionGuard({
  permission,
  requireAll = false,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { can, canAny, canAll, isLoading, isSuperAdmin } = usePermissions();

  if (isSuperAdmin) return <>{children}</>;
  if (isLoading) return null;

  const permissions = Array.isArray(permission) ? permission : [permission];
  const hasAccess = requireAll
    ? canAll(...permissions)
    : canAny(...permissions);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// ─── Shorthand guards for common TMS actions ───
type GuardProps = { children: React.ReactNode; fallback?: React.ReactNode };

export const CanManageRoutes = ({ children, fallback }: GuardProps) => (
  <PermissionGuard permission="tms.routes.edit" fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const CanManageVehicles = ({ children, fallback }: GuardProps) => (
  <PermissionGuard permission="tms.vehicles.edit" fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const CanManageDrivers = ({ children, fallback }: GuardProps) => (
  <PermissionGuard permission="tms.drivers.manage" fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const CanViewReports = ({ children, fallback }: GuardProps) => (
  <PermissionGuard permission="tms.reports.view" fallback={fallback}>
    {children}
  </PermissionGuard>
);

export const CanScanAttendance = ({ children, fallback }: GuardProps) => (
  <PermissionGuard permission="tms.attendance.scan" fallback={fallback}>
    {children}
  </PermissionGuard>
);
