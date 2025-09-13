'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
  requiredPermissions?: string[];
  requiredRoles?: string[];
  requireAnyRole?: boolean;
  onUnauthorized?: () => void;
  loadingComponent?: ReactNode;
}

const DefaultLoading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

export function ProtectedRoute({
  children,
  fallback,
  redirectTo,
  requiredPermissions = [],
  requiredRoles = [],
  requireAnyRole = true,
  onUnauthorized,
  loadingComponent
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated, hasPermission, hasRole, hasAnyRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      if (redirectTo) {
        router.push(redirectTo);
      } else if (onUnauthorized) {
        onUnauthorized();
      }
      return;
    }

    // Check authorization
    const isAuthorized = checkAuthorization();
    if (!isAuthorized) {
      if (onUnauthorized) {
        onUnauthorized();
      } else if (fallback) {
        // Will be rendered below
      } else {
        router.push('/unauthorized');
      }
    }
  }, [isLoading, isAuthenticated, user, router, redirectTo, onUnauthorized]);

  const checkAuthorization = (): boolean => {
    if (!user) return false;

    // Check permissions
    if (requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every(permission =>
        hasPermission(permission)
      );
      if (!hasAllPermissions) return false;
    }

    // Check roles
    if (requiredRoles.length > 0) {
      if (requireAnyRole) {
        const hasAnyRequiredRole = hasAnyRole(requiredRoles);
        if (!hasAnyRequiredRole) return false;
      } else {
        const hasAllRoles = requiredRoles.every(role => hasRole(role));
        if (!hasAllRoles) return false;
      }
    }

    return true;
  };

  if (isLoading) {
    return loadingComponent ? <>{loadingComponent}</> : <DefaultLoading />;
  }

  if (!isAuthenticated) {
    return fallback ? <>{fallback}</> : null;
  }

  if (!checkAuthorization()) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

// Higher-order component wrapper
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<ProtectedRouteProps, 'children'>
) {
  return function AuthenticatedComponent(props: P) {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}

// Convenience components
export function RequireAuth({
  children,
  redirectTo
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  return (
    <ProtectedRoute redirectTo={redirectTo || '/login'}>
      {children}
    </ProtectedRoute>
  );
}

export function RequirePermission({
  children,
  permission,
  fallback
}: {
  children: ReactNode;
  permission: string | string[];
  fallback?: ReactNode;
}) {
  const permissions = Array.isArray(permission) ? permission : [permission];

  return (
    <ProtectedRoute
      requiredPermissions={permissions}
      fallback={fallback}
    >
      {children}
    </ProtectedRoute>
  );
}

export function RequireRole({
  children,
  role,
  requireAll = false,
  fallback
}: {
  children: ReactNode;
  role: string | string[];
  requireAll?: boolean;
  fallback?: ReactNode;
}) {
  const roles = Array.isArray(role) ? role : [role];

  return (
    <ProtectedRoute
      requiredRoles={roles}
      requireAnyRole={!requireAll}
      fallback={fallback}
    >
      {children}
    </ProtectedRoute>
  );
}

export function GuestOnly({
  children,
  redirectTo = '/'
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo]);

  if (isLoading) {
    return <DefaultLoading />;
  }

  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

export function ConditionalAuth({
  authenticated,
  unauthenticated,
  loading
}: {
  authenticated: ReactNode;
  unauthenticated: ReactNode;
  loading?: ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return loading ? <>{loading}</> : <DefaultLoading />;
  }

  return isAuthenticated ? <>{authenticated}</> : <>{unauthenticated}</>;
}