'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface UsePermissionsResult {
  permissions: Record<string, boolean>;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isTransportManager: boolean;
  isDriver: boolean;
  isStudent: boolean;
  isFaculty: boolean;
  userRole: string | null;
  can: (permissionKey: string) => boolean;
  canAny: (...permissionKeys: string[]) => boolean;
  canAll: (...permissionKeys: string[]) => boolean;
}

/**
 * TMS permission hook. Reads the UNION of all the user's role permissions via
 * the shared get_user_merged_permissions() RPC, then narrows to tms.* keys.
 * Super admins bypass every check.
 */
export function usePermissions(): UsePermissionsResult {
  const { profile } = useAuth();
  const supabase = createClientSupabaseClient();

  const isSuperAdmin = profile?.is_super_admin ?? false;

  const { data: mergedPermissions = {}, isLoading } = useQuery({
    queryKey: ['tms-permissions', profile?.id],
    queryFn: async (): Promise<Record<string, boolean>> => {
      if (!profile || isSuperAdmin) return {};

      const { data, error } = await supabase.rpc(
        'get_user_merged_permissions',
        { p_user_id: profile.id }
      );

      if (error) {
        console.error('Failed to fetch permissions:', error);
        return {};
      }

      const tmsPermissions: Record<string, boolean> = {};
      if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(
          data as Record<string, boolean>
        )) {
          if (key.startsWith('tms.')) tmsPermissions[key] = value;
        }
      }
      return tmsPermissions;
    },
    enabled: !!profile && !isSuperAdmin,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const can = (key: string): boolean => {
    if (isSuperAdmin) return true;
    return mergedPermissions[key] === true;
  };

  const canAny = (...keys: string[]): boolean => keys.some((k) => can(k));
  const canAll = (...keys: string[]): boolean => keys.every((k) => can(k));

  return {
    permissions: mergedPermissions,
    isLoading: isSuperAdmin ? false : isLoading,
    isSuperAdmin,
    isTransportManager:
      profile?.role === 'transport_manager' || can('tms.settings.manage'),
    isDriver: profile?.role === 'driver',
    isStudent: profile?.role === 'student',
    isFaculty: profile?.role === 'faculty',
    userRole: profile?.role ?? null,
    can,
    canAny,
    canAll,
  };
}
