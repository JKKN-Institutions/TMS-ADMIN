'use client';

import { useEffect, useState } from 'react';

/**
 * Reads the current admin's role from localStorage (the module's existing auth
 * source — `adminUser`) and derives the two capability flags the GPS pages gate on.
 * Centralised here so the list page, columns and detail pages stay in lockstep.
 */
export function useGpsRole() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('adminUser');
      if (raw) setRole(JSON.parse(raw)?.role ?? null);
    } catch {
      /* malformed/missing adminUser → no elevated capabilities */
    }
  }, []);

  return {
    role,
    canManage: ['super_admin', 'transport_manager'].includes(role ?? ''),
    canDelete: role === 'super_admin',
  };
}
