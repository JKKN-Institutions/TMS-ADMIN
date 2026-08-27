'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle2, Clock, LogOut, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { usePermissions } from '@/hooks/use-permissions';
import { getVacateColumns, VacateStatusBadge } from './columns';
import type { VacateRequestDTO } from '@/lib/vacate/types';

async function fetchList(): Promise<VacateRequestDTO[]> {
  const res = await fetch('/api/admin/vacate-requests', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
  return (await res.json()).data as VacateRequestDTO[];
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: typeof Clock; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-semibold leading-none text-gray-900 dark:text-gray-100">{value}</div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</div>
      </div>
    </div>
  );
}

export default function VacateRequestsPage() {
  const qc = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || can('tms.vacate.manage');

  const { data: list = [], isLoading, error } = useQuery({ queryKey: ['admin-vacate-requests'], queryFn: fetchList });
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const selected = openId ? list.find((r) => r.id === openId) ?? null : null;

  const decide = useMutation({
    mutationFn: async (payload: { id: string; note?: string }) => {
      const res = await fetch(`/api/admin/vacate-requests/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'reject', note: payload.note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed');
      return json as Record<string, never>;
    },
    onSuccess: () => {
      toast.success('Request rejected');
      setOpenId(null);
      setRejectNote('');
      qc.invalidateQueries({ queryKey: ['admin-vacate-requests'] });
    },
    // Leave the panel OPEN on failure so the error is read next to the action
    // that caused it and the approver can retry without re-finding the row.
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const onReject = (r: VacateRequestDTO) => {
    setOpenId(r.id);
    setRejectNote('');
  };
  const onView = (r: VacateRequestDTO) => setOpenId(r.id);

  const columns = useMemo(
    () => getVacateColumns(onView, onReject, canManage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, decide.isPending],
  );

  const stats = useMemo(
    () => ({
      pending: list.filter((r) => r.status === 'pending').length,
      approved: list.filter((r) => r.status === 'approved').length,
      rejected: list.filter((r) => r.status === 'rejected').length,
    }),
    [list],
  );

  if (error) return <div className="p-4 text-destructive">{(error as Error).message}</div>;

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-semibold">Transport Vacate Requests</h1>
        <p className="text-sm text-muted-foreground">
          Historical record of transport vacate requests. Learners can no longer submit new requests, and
          transport fees are not cancelled once the transport service has been availed.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Pending" value={stats.pending} icon={Clock} accent="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} accent="bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" />
        <StatCard label="Rejected" value={stats.rejected} icon={AlertCircle} accent="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" />
      </div>

      <DataTable
        columns={columns}
        data={list}
        entityName="vacate requests"
        isLoading={isLoading}
        searchPlaceholder="Search learner, roll…"
        filters={[
          {
            columnId: 'status',
            title: 'Status',
            options: [
              { label: 'Pending', value: 'pending' },
              { label: 'Approved', value: 'approved' },
              { label: 'Rejected', value: 'rejected' },
              { label: 'Withdrawn', value: 'withdrawn' },
            ],
          },
        ]}
      />

      {/* Inline detail / reject panel */}
      {selected && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-500/5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <LogOut className="h-4 w-4 text-gray-500" />
                <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{selected.learnerName}</h2>
                <VacateStatusBadge status={selected.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.rollNumber ? `${selected.rollNumber} · ` : ''}
                {selected.routeLabel ?? 'No route'} ·{' '}
                {selected.status === 'approved'
                  ? `${selected.cancelledBillCount} term(s) cancelled`
                  : `To cancel: ${inr(selected.amountToCancel)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              aria-label="Close"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            {selected.reason && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Learner&apos;s reason</h3>
                <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm text-gray-700 dark:text-gray-300">{selected.reason}</p>
              </div>
            )}
            {selected.decisionNote && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Decision note</h3>
                <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm text-gray-700 dark:text-gray-300">{selected.decisionNote}</p>
              </div>
            )}

            {canManage && selected.status === 'pending' && (
              <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reject reason (required to reject)</label>
                  <Input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Why is this request declined?" className="mt-1" />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => decide.mutate({ id: selected.id, note: rejectNote })}
                    disabled={!rejectNote.trim() || decide.isPending}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
