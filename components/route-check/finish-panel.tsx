'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CheckCounts } from '@/lib/route-check/types';
import type { CheckFinePreview } from '@/lib/route-check/fines';
import { fetchFinePreview, submitCheck } from '@/app/boarding/route-check/route-check-api';

export function FinishPanel({
  checkId,
  counts,
  open,
  onClose,
}: {
  checkId: string;
  counts: CheckCounts;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  // Re-read every time the dialog opens: ticks change between opens.
  const preview = useQuery({
    queryKey: ['route-check', checkId, 'fine-preview'],
    queryFn: () => fetchFinePreview(checkId),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const willRaise = preview.data?.enabled ? preview.data.fee.willRaise + preview.data.booking.willRaise : 0;

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await submitCheck(checkId);
      const f = res.fines;
      if (f === null) {
        // The check itself submitted fine — only the fining step failed or
        // threw. Distinguish this from "fines off" / "no fines needed", which
        // both come back as a normal { enabled: false | true } summary.
        toast.error('Check submitted, but automatic fines could not be processed — tell the Transport Head');
      } else if (f.enabled) {
        toast.success(`Check submitted · ${f.raised} fine${f.raised === 1 ? '' : 's'} raised` +
          (f.alreadyFined ? ` · ${f.alreadyFined} already fined` : '') + (f.errors ? ` · ${f.errors} failed` : ''));
      } else {
        toast.success('Check submitted');
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['route-check', checkId], exact: true }),
        qc.invalidateQueries({ queryKey: ['route-check', 'my-routes'] }),
      ]);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit the check');
      // A 409 means the server already moved this check to submitted — refresh so the page reflects that.
      void qc.invalidateQueries({ queryKey: ['route-check', checkId], exact: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Finish check</DialogTitle>
          <DialogDescription>Review the summary before submitting.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-1.5 py-2">
          <SummaryRow label={`Checked ${counts.checked} · Registered ${counts.registered}`} />
          <SummaryRow label="Unpaid" value={counts.unpaid} />
          <SummaryRow label="Without booking" value={counts.withoutBooking} />
          <SummaryRow label="Not on this bus" value={counts.notOnRoute} />
        </div>

        <FinePreviewBox loading={preview.isLoading} failed={preview.isError} data={preview.data} />

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-green-700 dark:hover:bg-green-600"
          >
            {submitting ? 'Submitting…' : willRaise > 0 ? `Submit · raise ${willRaise} fine${willRaise === 1 ? '' : 's'}` : 'Submit check'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Not yet
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
      <span className="min-w-0 truncate text-gray-600 dark:text-gray-400">{label}</span>
      {value !== undefined && <span className="shrink-0 font-semibold text-gray-900 dark:text-gray-100">{value}</span>}
    </div>
  );
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * What submitting will charge, shown BEFORE the tap: submit cannot be undone and
 * a fine can only be cancelled in MyJKKN with a supporting document.
 */
function FinePreviewBox({ loading, failed, data }: { loading: boolean; failed: boolean; data: CheckFinePreview | undefined }) {
  const box = 'min-w-0 rounded-lg border px-3 py-2 text-sm';
  if (loading) {
    return <p className={`${box} border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400`}>Working out fines…</p>;
  }
  if (failed || !data) {
    return (
      <p className={`${box} border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300`}>
        Could not work out the fines. They are still decided when you submit.
      </p>
    );
  }
  if (!data.enabled) {
    return <p className={`${box} border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400`}>Automatic fines are off. Submitting raises no fines.</p>;
  }
  const { fee, booking } = data;
  const already = fee.alreadyFined + booking.alreadyFined;
  if (fee.willRaise + booking.willRaise === 0) {
    return (
      <p className={`${box} border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400`}>
        No new fines.{already > 0 && ` ${already} already fined earlier (not charged again).`}
      </p>
    );
  }
  return (
    <div className={`${box} space-y-1 border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300`}>
      <p className="font-semibold">Submitting will raise:</p>
      {fee.willRaise > 0 && <p>{fee.willRaise} × {rupees(data.unpaidAmount)} unpaid fee fine</p>}
      {booking.willRaise > 0 && <p>{booking.willRaise} × {rupees(data.noBookingAmount)} no-booking fine</p>}
      {already > 0 && <p className="text-xs">{already} already fined earlier (not charged again).</p>}
      <p className="text-xs">Fines cannot be undone here.</p>
    </div>
  );
}
