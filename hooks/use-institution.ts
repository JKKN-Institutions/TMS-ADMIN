'use client';

import { useAuth } from '@/providers/auth-provider';

/**
 * Institution context for the signed-in user. TMS v1 assumes a single
 * institution per user (profiles.institution_id). Multi-institution access can
 * be layered on later via user_institution_access.
 */
export function useInstitution() {
  const { profile } = useAuth();
  return {
    institutionId: profile?.institution_id ?? null,
  };
}
