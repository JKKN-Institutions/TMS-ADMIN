'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Colleague { email: string; name: string }

export interface AbsenceRoute { id: string; number: string | null }

/**
 * Declare that you will not be on the bus on a given day, and optionally ask a
 * colleague to mark your share.
 *
 * The helper text is load-bearing: an in-charge must not believe that failing
 * to find cover is what gets them billed. A declared absence excuses them
 * either way; the uncovered share becomes the transport office's problem, not
 * a sick person's.
 *
 * The declaration is per ROUTE, so the route is chosen here rather than
 * inherited. An in-charge on two buses used to have the roster's first row
 * decide it silently, which meant declaring absence on a route they were not
 * thinking of -- and being scored as present on the one they meant. The route
 * is always named, even when there is only one, because "which bus did I just
 * excuse myself from?" must never be a guess.
 */
export default function AbsenceDialog({
  open,
  onOpenChange,
  routes,
  date,
  onDeclared,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  routes: AbsenceRoute[];
  date: string;
  onDeclared: () => void;
}) {
  const [reason, setReason] = useState('');
  const [covering, setCovering] = useState('');
  const [saving, setSaving] = useState(false);
  const [routeId, setRouteId] = useState('');

  // Default to the only/first route, and re-default whenever the dialog is
  // reopened or the roster changes underneath it, so a stale id from a
  // previous day's roster can never be submitted.
  useEffect(() => {
    if (!open) return;
    setRouteId((current) => (routes.some((r) => r.id === current) ? current : routes[0]?.id ?? ''));
  }, [open, routes]);

  // Nominations are route-scoped: a colleague on the other bus is not cover
  // here, so switching route must drop whoever was picked.
  useEffect(() => {
    setCovering('');
  }, [routeId]);

  const routeLabel = (r: AbsenceRoute) => (r.number ? `Route ${r.number}` : 'Unnumbered route');
  const selected = routes.find((r) => r.id === routeId) ?? null;

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
          <DialogTitle>
            Absent on {date}
            {selected ? ` — ${routeLabel(selected)}` : ''}
          </DialogTitle>
        </DialogHeader>

        {routes.length > 1 ? (
          <div>
            <label className="block text-xs font-medium text-gray-500">Route</label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="mt-1 h-[38px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{routeLabel(r)}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              You are an in-charge on more than one bus. This declaration excuses
              you from the selected route only.
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This excuses you from {selected ? routeLabel(selected) : 'your route'} on {date}.
          </p>
        )}

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
          <Button type="button" onClick={submit} disabled={saving || !routeId}>
            {saving ? 'Saving…' : 'Record absence'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
