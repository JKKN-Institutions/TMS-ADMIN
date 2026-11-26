'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UserCheck, UserX } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { displayStatus } from '@/lib/drivers/status-rule';
import { titleCase } from '@/lib/format/display';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface StatusResult {
  routes: { id: string; label: string }[];
  mobilesHeld: number;
  warning?: string;
}

/**
 * Confirm marking a driver inactive (or active again). Inactive is the employee
 * flag MyJKKN reads, so the wording says what happens outside TMS too.
 */
export function DriverStatusDialog({ driver, open, onOpenChange }: {
  driver: DriverListItem | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  // The direction comes from what the driver is now: an inactive driver is offered "active".
  const makeActive = driver ? displayStatus(driver) === 'inactive' : false;
  const name = driver ? titleCase(driver.name) : '';
  const routeLabels = driver?.routes.map((r) => r.label).join(', ') ?? '';

  const mutation = useMutation({
    mutationFn: async (): Promise<StatusResult> => {
      const res = await fetch(`/api/admin/drivers/${encodeURIComponent(driver!.id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: makeActive }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not change the status');
      return json.data as StatusResult;
    },
    onSuccess: (result) => {
      // Routes and buses show the driver too, so their lists are stale as well.
      for (const key of [['drivers'], ['driver', driver!.id], ['routes'], ['vehicles']]) {
        qc.invalidateQueries({ queryKey: key });
      }
      toast.success(`${name} is now ${makeActive ? 'active' : 'inactive'}`);
      if (result.warning) toast.error(result.warning, { duration: 8000 });
      if (result.mobilesHeld > 0) {
        const phones = result.mobilesHeld === 1 ? '1 phone' : `${result.mobilesHeld} phones`;
        toast(`They still hold ${phones}. Collect ${result.mobilesHeld === 1 ? 'it' : 'them'} in Driver Mobiles.`, { duration: 8000 });
      }
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                makeActive
                  ? 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400'
              }`}
            >
              {makeActive ? <UserCheck className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
            </div>
            <DialogTitle>{makeActive ? `Mark ${name} active?` : `Mark ${name} inactive?`}</DialogTitle>
          </div>
          <DialogDescription asChild>
            {makeActive ? (
              <p className="pt-2 text-sm text-gray-600">
                They will show as Active in MyJKKN and can sign in again. Choose their route again if they need one.
              </p>
            ) : (
              <ul className="list-disc space-y-1.5 pl-5 pt-2 text-sm text-gray-600">
                <li>They will show as Inactive in the MyJKKN employee list.</li>
                <li>They can no longer sign in to the driver app or any other JKKN app.</li>
                {routeLabels && (
                  <li>
                    They will be taken off <span className="font-medium text-gray-900">{routeLabels}</span>. That route
                    will have no driver until you choose one.
                  </li>
                )}
                <li>Making them active again later will not put them back on the route.</li>
              </ul>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={busy}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              makeActive ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {busy ? 'Saving…' : makeActive ? 'Mark active' : 'Mark inactive'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
