'use client';

import { useCallback } from 'react';
import { offlineKv } from '@/lib/boarding/offline/kv';
import { countPending } from '@/lib/boarding/offline/outbox';

/**
 * Sign-out that says so when marks are still on the phone. They are filed
 * under this user and are never sent as anyone else, so they wait safely for
 * this user's next sign-in -- but the staffer should know that.
 */
export function useSafeSignOut(signOut: () => Promise<void>, userId: string | null) {
  return useCallback(async () => {
    if (userId) {
      const n = await countPending(offlineKv(), userId).catch(() => 0);
      if (n > 0) {
        const ok = window.confirm(
          `${n} attendance mark${n === 1 ? ' is' : 's are'} saved on this phone and not sent yet. ` +
          'They will be sent the next time you sign in here. Sign out anyway?',
        );
        if (!ok) return;
      }
    }
    await signOut();
  }, [signOut, userId]);
}
