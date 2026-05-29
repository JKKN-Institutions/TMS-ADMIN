'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export function DriverBulkDeleteDialog({ drivers, open, onOpenChange, onDeleted }: {
  drivers: DriverListItem[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const count = drivers.length;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/drivers/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffIds: drivers.map((d) => d.id) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Bulk delete failed');
      return json;
    },
    onSuccess: (json: { deleted?: number }) => {
      toast.success(`Removed operational records for ${json.deleted ?? count} driver${count > 1 ? 's' : ''}`);
      qc.invalidateQueries({ queryKey: ['drivers'] });
      onDeleted?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle>Remove {count} driver record{count > 1 ? 's' : ''}?</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            This removes the TMS operational details (license, status, trips and related fields) for the selected
            driver{count > 1 ? 's' : ''}. The staff members stay in MyJKKN and can be re-added to TMS later. This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {count > 0 && (
          <div className="my-1 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 text-sm">
            {drivers.map((d) => (
              <div key={d.id} className="truncate text-gray-700">• {d.name}{d.email ? ` (${d.email})` : ''}</div>
            ))}
          </div>
        )}

        <DialogFooter>
          <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || count === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Removing…' : `Remove ${count} record${count > 1 ? 's' : ''}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
