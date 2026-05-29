'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import type { DriverListItem } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export function DriverDeleteDialog({ driver, open, onOpenChange }: {
  driver: DriverListItem | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/drivers?staffId=${encodeURIComponent(driver!.id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Delete failed');
      return json;
    },
    onSuccess: () => {
      toast.success('Driver operational record removed');
      qc.invalidateQueries({ queryKey: ['drivers'] });
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
            <DialogTitle>Remove driver record?</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            This removes the TMS operational details for{' '}
            <span className="font-medium text-gray-900">{driver?.name}</span> (license, status, trips and related
            fields). The staff member stays in MyJKKN and can be re-added to TMS later. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Removing…' : 'Remove record'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
