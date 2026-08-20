'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { FINE_SKIP_LABEL } from '@/lib/fines/resolve';
import { priceableStops, draftsToRates } from '@/lib/fines/rate-drafts';
import type { TransportBillRow } from '@/lib/fees/bills';
import { inr } from './columns';
import { previewFines, createFines, saveFineRates } from './fines-api';

/** Default due date: 15 days out. A fine dated in the past is born overdue. */
function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

export function FineDialog({
  open,
  year,
  selectedRows,
  onClose,
  onDone,
}: {
  open: boolean;
  year: string;
  selectedRows: TransportBillRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // stop_id -> the amount being typed. Keyed by STOP, not learner: the sheet
  // holds one rate per stop, so several learners boarding there share one input.
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [savingRates, setSavingRates] = useState(false);

  // One key per opening of the dialog: a retried submission is a no-op, while a
  // deliberate second fine (new dialog) gets a new key and is allowed.
  const idempotencyKey = useRef<string>('');
  useEffect(() => {
    if (open) {
      idempotencyKey.current = crypto.randomUUID();
      setDueDate(defaultDueDate());
      setReason('');
      setRateDrafts({});
    }
  }, [open]);

  // Selection is over BILL rows: ticking Term 1 and Term 2 of one learner must
  // produce ONE fine. Staff rows cannot be fined (no learners_profiles row).
  const { personIds, staffCount, sourceBillByPerson } = useMemo(() => {
    const byPerson = new Map<string, string>();
    let staff = 0;
    for (const r of selectedRows) {
      if (r.person_type === 'staff') {
        staff++;
        continue;
      }
      if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, r.id);
    }
    return {
      personIds: [...byPerson.keys()],
      staffCount: staff,
      sourceBillByPerson: Object.fromEntries(byPerson),
    };
  }, [selectedRows]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['fine-preview', year, personIds.join(',')],
    queryFn: () => previewFines(year, personIds),
    enabled: open && personIds.length > 0,
  });

  const finable = useMemo(
    () => (data?.candidates ?? []).filter((c) => c.amount !== null),
    [data]
  );

  // Stops the operator can price without leaving the dialog, and the set of
  // stop ids that get an input rendered against them.
  const unpricedStops = useMemo(() => priceableStops(data?.candidates ?? []), [data]);
  const unpricedStopIds = useMemo(
    () => new Set(unpricedStops.map((s) => s.stop_id)),
    [unpricedStops]
  );
  const filledDrafts = useMemo(
    () => Object.values(rateDrafts).filter((v) => v.trim() !== '').length,
    [rateDrafts]
  );

  /**
   * Save the typed amounts into the year's fine sheet, then re-price. This is a
   * SEPARATE act from raising the fine: the rate is permanent and applies to
   * every learner at that stop, so it gets its own click and its own audit entry.
   */
  async function saveRates() {
    setSavingRates(true);
    try {
      const rates = draftsToRates(rateDrafts);
      if (!rates.length) return;
      await saveFineRates(year, rates);
      setRateDrafts({});
      await refetch();
      toast.success(
        `Saved ${rates.length} stop rate(s) to the fine sheet. Re-priced the selection.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the stop rates');
    } finally {
      setSavingRates(false);
    }
  }

  if (!open) return null;

  async function submit() {
    // Typed-but-unsaved amounts are not in the sheet, so those learners would be
    // skipped without explanation. Refuse rather than under-fine silently.
    if (filledDrafts > 0) {
      toast.error(`Save the ${filledDrafts} stop rate(s) first, or clear them.`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await createFines({
        year,
        personIds,
        dueDate,
        reason: reason.trim(),
        notify,
        idempotencyKey: idempotencyKey.current,
        sourceBillByPerson,
      });
      toast.success(`Raised ${result.created} fine(s) totalling ${inr(result.totalAmount)}.`);
      if (result.duplicates) toast(`${result.duplicates} already raised — skipped.`);
      if (result.errors) toast.error(`${result.errors} fine(s) failed. Check the Fines tab.`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not raise the fines');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Generate fine</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          The amount comes from each learner&apos;s boarding stop in this year&apos;s fine sheet. It is
          raised as a separate bill and does not affect their transport access.
        </p>

        {staffCount > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            {staffCount} staff row(s) skipped — fines apply to learners only.
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-200">Reason</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Late payment — August"
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify each learner in the app
        </label>

        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-green-600" />
            </div>
          ) : isError ? (
            <p className="p-3 text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t price the selection.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Learner</th>
                  <th className="px-3 py-2">Stop</th>
                  <th className="px-3 py-2 text-right">Fine</th>
                </tr>
              </thead>
              <tbody>
                {(data?.candidates ?? []).map((c) => (
                  <tr key={c.person_id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                      {c.person_name}
                      {c.code ? (
                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{c.code}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{c.stop_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {c.amount !== null ? (
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {inr(c.amount)}
                        </span>
                      ) : c.stop_id && unpricedStopIds.has(c.stop_id) ? (
                        // Unpriced stop: price it here and it lands in the sheet.
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          inputMode="decimal"
                          value={rateDrafts[c.stop_id] ?? ''}
                          onChange={(e) =>
                            setRateDrafts((d) => ({ ...d, [c.stop_id as string]: e.target.value }))
                          }
                          placeholder="Set fine ₹"
                          aria-label={`Fine amount for ${c.stop_name ?? 'this stop'}`}
                          className="h-8 w-28 rounded-lg border border-amber-300 bg-amber-50 px-2 text-right text-sm text-gray-900 placeholder:text-amber-700/60 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-gray-100 dark:placeholder:text-amber-300/60"
                        />
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400">
                          {c.skip_reason ? FINE_SKIP_LABEL[c.skip_reason] : 'Not finable'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {unpricedStops.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              {unpricedStops.length} stop(s) have no fine configured. Enter an amount above to
              price them — it is saved to this year&apos;s fine sheet and applies to{' '}
              <strong>every learner boarding that stop</strong>, not just this fine.
            </p>
            {unpricedStops.some((s) => s.learner_count > 1) && (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                {unpricedStops
                  .filter((s) => s.learner_count > 1)
                  .map((s) => `${s.stop_name ?? 'Stop'} covers ${s.learner_count} of the selected learners`)
                  .join(' · ')}
                .
              </p>
            )}
            <button
              type="button"
              onClick={saveRates}
              disabled={savingRates || filledDrafts === 0}
              className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-amber-600 px-3 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {savingRates ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save {filledDrafts} stop rate(s)
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {finable.length} learner(s) · total{' '}
            <span className="font-semibold">{inr(data?.totalAmount ?? 0)}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || finable.length === 0 || reason.trim() === ''}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Raise {finable.length} fine(s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
