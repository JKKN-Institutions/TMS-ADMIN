'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Colleague { email: string; name: string }

/**
 * Declare that you will not be on the bus on a given day, and optionally ask a
 * colleague to mark your share.
 *
 * The helper text is load-bearing: an in-charge must not believe that failing
 * to find cover is what gets them billed. A declared absence excuses them
 * either way; the uncovered share becomes the transport office's problem, not
 * a sick person's.
 */
export default function AbsenceDialog({
  open,
  onOpenChange,
  routeId,
  date,
  onDeclared,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  routeId: string;
  date: string;
  onDeclared: () => void;
}) {
  const [reason, setReason] = useState('');
  const [covering, setCovering] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: colleagues = [] } = useQuery({
    queryKey: ['route-incharges', routeId],
    enabled: open && Boolean(routeId),
    queryFn: async (): Promise<Colleague[]> => {
      const res = await fetch(`/api/boarding/routes/${routeId}/roster`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || !json?.success) return [];
      return (json.data?.staff ?? []) as Colleague[];
    },
  });

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/boarding/absence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          routeId,
          date,
          reason: reason.trim() || undefined,
          coveringStaffEmail: covering || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to record absence');
      toast.success(covering ? 'Absence recorded and cover requested' : 'Absence recorded');
      onDeclared();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record absence');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Absent on {date}</DialogTitle>
        </DialogHeader>

        <div>
          <label className="block text-xs font-medium text-gray-500">Reason (optional)</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Sick leave, on duty elsewhere..."
            className="mt-1"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500">
            Ask a colleague to cover (optional)
          </label>
          <select
            value={covering}
            onChange={(e) => setCovering(e.target.value)}
            className="mt-1 h-[38px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">Nobody — leave my share unmarked</option>
            {colleagues.map((c) => (
              <option key={c.email} value={c.email}>{c.name}</option>
            ))}
          </select>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          You are excused for this day either way. If nobody covers, your students
          will go unmarked and the transport office will see the gap.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Record absence'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
