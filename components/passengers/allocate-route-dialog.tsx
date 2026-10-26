'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { LearnerPassenger } from '@/lib/passengers/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { titleCase } from '@/lib/format/display';

interface RouteOpt {
  id: string;
  label: string;
  stops: { id: string; name: string }[];
}

async function fetchRouteOptions(): Promise<RouteOpt[]> {
  const res = await fetch('/api/admin/enrollment-requests?routesOnly=1', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed to load routes (HTTP ${res.status})`);
  return (json.data?.routes ?? []) as RouteOpt[];
}

/**
 * Assign (or change / clear) a learner's bus route and boarding stop. Moved here
 * from the old Enrollments page so the Learners list can assign per row.
 * Writes through PATCH /api/admin/enrollment-requests, which also recomputes
 * the in-charge shares and notifies the learner.
 */
export function AllocateRouteDialog({
  learner,
  onOpenChange,
}: {
  learner: LearnerPassenger | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [routeId, setRouteId] = useState('');
  const [stopId, setStopId] = useState('');

  useEffect(() => {
    setRouteId('');
    setStopId('');
  }, [learner?.id]);

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['allocation-route-options'],
    queryFn: fetchRouteOptions,
    enabled: !!learner,
    staleTime: 5 * 60_000,
  });

  const allocate = useMutation({
    mutationFn: async (payload: { learnerId: string; routeId: string | null; stopId: string | null }) => {
      const res = await fetch('/api/admin/enrollment-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save');
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.routeId ? 'Route assigned' : 'Route allocation cleared');
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ['passenger-learners'] });
      qc.invalidateQueries({ queryKey: ['passenger-learner'] });
    },
  });

  const selectedRoute = routes.find((r) => r.id === routeId);

  return (
    <Dialog open={!!learner} onOpenChange={(o) => !allocate.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{learner?.assigned ? 'Change route' : 'Assign route'} — {titleCase(learner?.name)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {learner?.assigned && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800/50">
              Current: <span className="font-medium">{learner.routeLabel}</span> · {learner.stopLabel}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600" htmlFor="alloc-route">Route</label>
            <select
              id="alloc-route"
              className="mt-1 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm dark:border-gray-600"
              value={routeId}
              disabled={isLoading}
              onChange={(e) => {
                setRouteId(e.target.value);
                setStopId('');
              }}
            >
              <option value="">{isLoading ? 'Loading routes…' : 'Select a route…'}</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600" htmlFor="alloc-stop">Boarding stop</label>
            <select
              id="alloc-stop"
              className="mt-1 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600"
              value={stopId}
              onChange={(e) => setStopId(e.target.value)}
              disabled={!selectedRoute}
            >
              <option value="">Select a stop…</option>
              {selectedRoute?.stops.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {allocate.isError && <p className="text-xs text-red-600">{(allocate.error as Error).message}</p>}
        </div>
        <DialogFooter className="gap-2">
          {learner?.assigned && (
            <Button
              variant="outline"
              onClick={() => learner && allocate.mutate({ learnerId: learner.id, routeId: null, stopId: null })}
              disabled={allocate.isPending}
            >
              Clear allocation
            </Button>
          )}
          <Button
            onClick={() => learner && allocate.mutate({ learnerId: learner.id, routeId, stopId })}
            disabled={!routeId || !stopId || allocate.isPending}
          >
            {allocate.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
