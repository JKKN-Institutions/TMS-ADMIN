'use client';

import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DetailPageHeader } from '@/components/ui/detail-view';
import { usePermissions } from '@/hooks/use-permissions';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';
import { FeeMarkChip, BookingMarkChip } from '@/components/route-check/marks';
import { FINE_NOTE_LABEL, type FineNote } from '@/lib/route-check/fine-rules';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { fetchCheck, waiveFine } from '../../inspection-api';

const LEG_LABEL: Record<'onward' | 'return', string> = { onward: 'Morning', return: 'Evening' };
const OUTCOME_LABEL: Record<string, string> = {
  ok: 'OK',
  not_on_route: 'Not on this route',
  no_booking: 'No booking',
  fee_unpaid: 'Fee unpaid',
  unknown_card: 'Unknown card',
  manual: 'Manual entry',
};

function fmtDateTime(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** fine_note is space-separated `<rule>:<note>` parts, or the single word 'fines_off' / 'error'. */
function fineNoteLabels(note: string | null): string[] {
  if (!note) return [];
  return note
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':');
      const key = idx >= 0 ? part.slice(idx + 1) : part;
      return FINE_NOTE_LABEL[key as FineNote] ?? part;
    });
}

function WaiveDialog({ open, onOpenChange, onConfirm, pending }: {
  open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: string) => void; pending: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { onOpenChange(o); if (!o) setReason(''); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Waive this fine</DialogTitle>
        </DialogHeader>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            placeholder="Why is this fine being waived?"
          />
        </div>
        <DialogFooter>
          <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={pending || !reason.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? 'Waiving…' : 'Waive fine'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CheckReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = usePermissions();
  const qc = useQueryClient();
  const canWaive = can(TMS_PERMISSIONS.FEES_EDIT);
  const [waiveTarget, setWaiveTarget] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({ queryKey: ['check', id], queryFn: () => fetchCheck(id) });

  const waive = useMutation({
    mutationFn: (vars: { fineId: string; reason: string }) => waiveFine(vars.fineId, vars.reason),
    onSuccess: () => {
      toast.success('Fine waived');
      qc.invalidateQueries({ queryKey: ['check', id] });
      setWaiveTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-w-0 space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="h-40 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-sm text-red-600 dark:text-red-400">{(error as Error)?.message ?? 'Route check not found.'}</p>;
  }

  const counts = [
    { label: 'Registered', value: data.counts.registered },
    { label: 'Booked', value: data.counts.booked },
    { label: 'Present', value: data.counts.present },
    { label: 'Unpaid', value: data.counts.unpaid },
    { label: 'Without booking', value: data.counts.withoutBooking },
    { label: 'Not on route', value: data.counts.notOnRoute },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <DetailPageHeader
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Bus Inspection', href: '/inspections' }, { label: 'Check' }]}
        backHref="/inspections"
        title={`${data.route?.routeNumber ?? 'Route'} · ${data.checkDate}`}
        subtitle={`${LEG_LABEL[data.leg]} trip · ${data.bus?.registration ?? 'No bus'} · Inspector ${data.checker.name ?? data.checker.email ?? '—'} · Submitted ${fmtDateTime(data.submittedAt)}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{c.value ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Booking</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Fines</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.people.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400" colSpan={5}>
                  No people recorded on this check.
                </td>
              </tr>
            )}
            {data.people.map((p) => {
              const noteLabels = fineNoteLabels(p.fineNote);
              return (
                <tr key={p.id}>
                  <td className="min-w-0 px-4 py-3">
                    <p className="truncate font-medium text-gray-900 dark:text-gray-100">{p.name ?? '—'}</p>
                    {p.code && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{p.code}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <FeeMarkChip mark={p.feeState} />
                  </td>
                  <td className="px-4 py-3">
                    <BookingMarkChip mark={p.bookingState} />
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{OUTCOME_LABEL[p.outcome] ?? p.outcome}</td>
                  <td className="min-w-0 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.feeFineId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          Fee fine
                          {canWaive && (
                            <button type="button" onClick={() => setWaiveTarget(p.feeFineId)} className="ml-1 underline decoration-dotted">
                              Waive
                            </button>
                          )}
                        </span>
                      )}
                      {p.bookingFineId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          Booking fine
                          {canWaive && (
                            <button type="button" onClick={() => setWaiveTarget(p.bookingFineId)} className="ml-1 underline decoration-dotted">
                              Waive
                            </button>
                          )}
                        </span>
                      )}
                      {noteLabels.map((label, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <WaiveDialog
        open={!!waiveTarget}
        onOpenChange={(o) => !o && setWaiveTarget(null)}
        pending={waive.isPending}
        onConfirm={(reason) => waiveTarget && waive.mutate({ fineId: waiveTarget, reason })}
      />
    </div>
  );
}
