'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import type { AssignmentRow } from './columns';

/**
 * Styled confirm dialog for removing a staff ↔ route assignment (replaces the
 * native browser confirm()). The page keeps its list in local state, so the
 * parent passes `onDeleted` to refetch after a successful removal.
 */
export function AssignmentDeleteDialog({
  assignment,
  open,
  onOpenChange,
  onDeleted,
}: {
  assignment: AssignmentRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted?: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!assignment) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/staff-route-assignments?assignmentId=${encodeURIComponent(assignment.id)}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to remove assignment');
      toast.success('Assignment removed');
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove assignment');
    } finally {
      setDeleting(false);
    }
  };

  const routeLabel = assignment?.routes
    ? `${assignment.routes.route_number ?? ''} ${assignment.routes.route_name ?? ''}`.trim() || 'this route'
    : 'this route';

  return (
    <Dialog open={open} onOpenChange={(o) => !deleting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle>Remove assignment?</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            This removes the assignment of{' '}
            <span className="break-words font-medium text-gray-900">{assignment?.staff_email}</span> from route{' '}
            <span className="font-medium text-gray-900">{routeLabel}</span>. The staff member and the route are not
            deleted and the assignment can be re-created later. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {deleting ? 'Removing…' : 'Remove assignment'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
