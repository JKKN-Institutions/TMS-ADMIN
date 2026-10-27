'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { DetailPageHeader, SectionCard } from '@/components/ui/detail-view';
import { DataTable } from '@/components/ui/data-table';
import { CandidateSelectionContext, candidateColumns, routeLabel } from './columns';
import {
  groupCandidatesByRoute,
  chunkIds,
  type Candidate,
  type BulkResult,
  type BulkSummary,
} from '@/lib/staff-assignments/bulk';

const crumbs = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Staff Assignments', href: '/staff-route-assignments' },
  { label: 'Bulk Assign' },
];

// Mirrors MAX_BATCH in app/api/admin/staff-route-assignments/bulk/route.ts. A
// selection larger than this is submitted as several sequential POSTs instead
// of one request that the server would reject outright.
const BATCH_SIZE = 100;

async function fetchCandidates(): Promise<Candidate[]> {
  const res = await fetch('/api/admin/staff-route-assignments/bulk');
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load candidates');
  return (json.candidates || []) as Candidate[];
}

export default function BulkAssignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<{ summary: BulkSummary; results: BulkResult[] } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bulk-assign-candidates'],
    queryFn: fetchCandidates,
  });
  // Memoised: an inline `= []` default is a new array every render while loading.
  const candidates = useMemo(() => data ?? [], [data]);

  // Route groups now only feed the Route filter (same order the grouped list
  // used) and the "across N routes" count.
  const groups = useMemo(() => groupCandidatesByRoute(candidates), [candidates]);
  const routeFilter = useMemo(
    () => [{
      columnId: 'route',
      title: 'Route',
      options: groups.map((g) => ({ label: `${routeLabel(g)} (${g.staff.length})`, value: g.routeId })),
    }],
    [groups]
  );

  const toggle = (staffId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });

  const toggleGroup = (staff: Candidate[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = staff.every((s) => next.has(s.staffId));
      for (const s of staff) {
        if (allOn) next.delete(s.staffId);
        else next.add(s.staffId);
      }
      return next;
    });

  // toggle/toggleGroup only use functional setState, so they never go stale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selection = useMemo(() => ({ selected, toggle, toggleMany: toggleGroup }), [selected]);

  const selectedRouteCount = useMemo(
    () => new Set(candidates.filter((c) => selected.has(c.staffId)).map((c) => c.routeId)).size,
    [candidates, selected]
  );

  const handleSubmit = async () => {
    if (selected.size === 0) return toast.error('Select at least one staff member');
    setSaving(true);
    try {
      const ids = [...selected];
      const batches = chunkIds(ids, BATCH_SIZE);
      const merged: BulkResult[] = [];
      const summary: BulkSummary = { assigned: 0, skipped: 0, errors: 0 };
      let completed = 0; // Count of batches that POSTed successfully.
      let failureMessage: string | null = null;

      // Batches run sequentially so a failure partway through leaves the
      // earlier batches' work intact — never a silent all-or-nothing wipe.
      for (; completed < batches.length; completed++) {
        try {
          const res = await fetch('/api/admin/staff-route-assignments/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staffIds: batches[completed] }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.error || 'Failed to assign');
          merged.push(...(json.results as BulkResult[]));
          const s = json.summary as BulkSummary;
          summary.assigned += s.assigned;
          summary.skipped += s.skipped;
          summary.errors += s.errors;
        } catch (err) {
          failureMessage = err instanceof Error ? err.message : 'Failed to assign';
          break;
        }
      }

      // Only drop staff whose batch actually completed — anything in the
      // failed batch (or after it) stays selected so the user can retry
      // without reselecting everyone from scratch.
      const attempted = new Set(batches.slice(0, completed).flat());
      setSelected((prev) => new Set([...prev].filter((id) => !attempted.has(id))));

      if (merged.length > 0) {
        setResults({ summary, results: merged });
        // The list page's KPI cards and table both read this key.
        await queryClient.invalidateQueries({ queryKey: ['staff-route-assignments'] });
        await refetch();
      }

      if (failureMessage) {
        const remaining = ids.length - attempted.size;
        toast.error(
          attempted.size > 0
            ? `${failureMessage} — assigned ${summary.assigned} before the failure; ${remaining} staff remain selected, try again.`
            : failureMessage
        );
      } else {
        toast.success(`Assigned ${summary.assigned} staff`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <DetailPageHeader
        crumbs={crumbs}
        backHref="/staff-route-assignments"
        title="Bulk Assign In-Charges"
        subtitle="Assign bus-required staff to their own route. The route comes from the staff record — it is shown, not chosen."
      />

      {results && (
        <SectionCard title="Result">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Assigned <strong>{results.summary.assigned}</strong>, skipped{' '}
            <strong>{results.summary.skipped}</strong>, errors{' '}
            <strong>{results.summary.errors}</strong>.
          </p>
          <ul className="mt-3 space-y-1">
            {results.results
              .filter((r) => r.outcome !== 'assigned')
              .map((r) => (
                <li key={r.staffId} className="text-sm text-gray-500 dark:text-gray-400">
                  {r.name} — {r.message ?? r.outcome.replace(/_/g, ' ')}
                </li>
              ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title={`Unassigned bus-required staff (${candidates.length} across ${groups.length} route${groups.length === 1 ? '' : 's'})`}
      >
        <CandidateSelectionContext.Provider value={selection}>
          <DataTable
            columns={candidateColumns}
            data={candidates}
            entityName="staff"
            isLoading={isLoading}
            searchPlaceholder="Search name, email or route…"
            filters={routeFilter}
            getRowId={(c) => c.staffId}
            emptyMessage="No unassigned bus-required staff. Everyone eligible already has a route."
          />
        </CandidateSelectionContext.Provider>
      </SectionCard>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-500">
          {selected.size} selected across {selectedRouteCount} route{selectedRouteCount === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={saving}
            onClick={() => router.push('/staff-route-assignments')}>
            Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || selected.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {saving ? 'Assigning…' : 'Assign all'}
          </button>
        </div>
      </div>
    </div>
  );
}
