'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { assignInspector, searchPeople, type PersonHit } from './inspection-api';

interface RouteOption {
  id: string;
  route_number: string | null;
  route_name: string | null;
  status: string | null;
}

async function fetchActiveRoutes(): Promise<RouteOption[]> {
  const res = await fetch('/api/admin/routes');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Failed to load routes');
  const rows = (body.data ?? []) as RouteOption[];
  return rows.filter((r) => r.status === 'active');
}

export function AssignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<PersonHit | null>(null);
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
      setSelected(null);
      setRouteIds([]);
      setNotes('');
    }
  }, [open]);

  const { data: hits, isFetching: searching } = useQuery({
    queryKey: ['route-checkers-people', debounced],
    queryFn: () => searchPeople(debounced),
    enabled: open && debounced.length >= 3 && !selected,
  });

  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ['routes-active'],
    queryFn: fetchActiveRoutes,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      assignInspector({
        staffId: selected?.staffId ?? null,
        profileId: selected?.profileId ?? null,
        email: selected?.loginEmail ?? selected?.collegeEmail ?? selected?.email ?? null,
        routeIds,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (data) => {
      const skippedCount = data.skipped.length;
      toast.success(`Assigned ${data.created.length} route${data.created.length === 1 ? '' : 's'}${skippedCount ? `, ${skippedCount} already assigned` : ''}`);
      qc.invalidateQueries({ queryKey: ['inspectors'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = useMemo(() => !!selected && routeIds.length > 0 && !mutation.isPending, [selected, routeIds, mutation.isPending]);

  const toggleRoute = (id: string) => {
    setRouteIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign inspector</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!selected ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Search staff by name or email</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type at least 3 characters…"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </div>
              {searching && <p className="mt-2 text-xs text-gray-500">Searching…</p>}
              {!searching && debounced.length >= 3 && (hits?.length ?? 0) === 0 && (
                <p className="mt-2 text-xs text-gray-500">No matches.</p>
              )}
              {(hits?.length ?? 0) > 0 && (
                <ul className="mt-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                  {hits!.map((h, i) => (
                    <li key={`${h.source}-${h.staffId ?? h.profileId ?? i}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(h)}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{h.name}</span>
                        <span className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
                          {h.designation ?? '—'} · {h.collegeEmail ?? h.email ?? 'no email'}
                          {!h.hasLogin && ' · no login'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{selected.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {selected.designation ?? '—'} · {selected.collegeEmail ?? selected.email ?? 'no email'}
                  {!selected.hasLogin && ' · no login'}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="shrink-0 text-xs font-medium text-green-700 hover:underline dark:text-green-400">
                Change
              </button>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Routes</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-800">
              {routesLoading && <p className="px-1 py-1 text-xs text-gray-500">Loading routes…</p>}
              {!routesLoading && (routes?.length ?? 0) === 0 && <p className="px-1 py-1 text-xs text-gray-500">No active routes.</p>}
              {routes?.map((r) => (
                <label key={r.id} className="flex items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                  <input type="checkbox" checked={routeIds.includes(r.id)} onChange={() => toggleRoute(r.id)} />
                  <span className="min-w-0 truncate">
                    {r.route_number ?? '—'} {r.route_name ? `· ${r.route_name}` : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{notes.length}/500</p>
          </div>
        </div>

        <DialogFooter>
          <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Assigning…' : 'Assign'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
