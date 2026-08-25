'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { SelectMenu } from '@/components/ui/select-menu';
import { inr } from '@/app/(admin)/fees/columns';

interface StructureOption {
  id: string;
  name: string;
  fee_mode: string;
  transport_year_id: string;
}

interface ChangedStop {
  stop_id: string;
  stop_name: string | null;
  previous: number | null;
  fine_amount: number;
}

interface CopyPreview {
  structure_name: string;
  source_rows: number;
  to_insert: number;
  to_overwrite: number;
  unchanged: number;
  skipped_zero: number;
  will_write: number;
  sample_insert: ChangedStop[];
  sample_overwrite: ChangedStop[];
}

/** Stop-wise structures priced for the selected year — the only valid sources. */
async function fetchStopWiseStructures(year: string): Promise<StructureOption[]> {
  const res = await fetch('/api/admin/fees', { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'Failed to load fee structures');
  return (json.data as StructureOption[]).filter(
    (s) => s.fee_mode === 'stop_wise' && s.transport_year_id === year
  );
}

async function postCopy(body: {
  year: string;
  fee_structure_id: string;
  mode: 'preview' | 'apply';
  overwrite: boolean;
}): Promise<CopyPreview & { written?: number }> {
  const res = await fetch('/api/admin/fees/fine-rates/copy', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'Copy failed');
  return json.data;
}

export function CopyRatesDialog({
  open,
  year,
  onClose,
  onDone,
}: {
  open: boolean;
  year: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [structureId, setStructureId] = useState('');
  const [overwrite, setOverwrite] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open) {
      setStructureId('');
      setOverwrite(true);
    }
  }, [open]);

  const { data: structures = [], isLoading: loadingStructures } = useQuery({
    queryKey: ['stop-wise-structures', year],
    queryFn: () => fetchStopWiseStructures(year),
    enabled: open && !!year,
  });

  // Preview re-runs when the overwrite toggle changes, so the button count on
  // screen always matches what the apply will actually write.
  const {
    data: preview,
    isFetching: previewing,
    error: previewError,
  } = useQuery({
    queryKey: ['fine-rate-copy-preview', year, structureId, overwrite],
    queryFn: () => postCopy({ year, fee_structure_id: structureId, mode: 'preview', overwrite }),
    enabled: open && !!year && !!structureId,
  });

  const options = useMemo(() => structures.map((s) => ({ value: s.id, label: s.name })), [structures]);

  async function apply() {
    setApplying(true);
    try {
      const result = await postCopy({ year, fee_structure_id: structureId, mode: 'apply', overwrite });
      toast.success(`Copied ${result.written ?? result.will_write} fine rate(s).`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Copy failed');
    } finally {
      setApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Copy from fee structure
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Copies a stop-wise structure&apos;s annual amount into this year&apos;s fine sheet, stop for
          stop. It is a one-time copy — later changes to the fee structure do <strong>not</strong>{' '}
          follow through, so re-run this after revising rates.
        </p>

        <div className="mt-4">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Source fee structure
          </span>
          {loadingStructures ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading structures…</p>
          ) : options.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              No stop-wise fee structure exists for this transport year, so there are no per-stop
              amounts to copy.
            </p>
          ) : (
            <SelectMenu
              value={structureId}
              onValueChange={setStructureId}
              options={options}
              placeholder="Choose a stop-wise structure…"
              ariaLabel="Source fee structure"
            />
          )}
        </div>

        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Overwrite stops that already have a different fine
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Off: hand-set amounts are kept and only unpriced stops are filled.
            </span>
          </span>
        </label>

        {previewError ? (
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
            {previewError instanceof Error ? previewError.message : 'Preview failed'}
          </p>
        ) : null}

        {previewing ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking what would change…
          </p>
        ) : null}

        {preview && !previewing ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Stops to set', value: preview.to_insert },
                { label: 'To overwrite', value: preview.to_overwrite },
                { label: 'Already match', value: preview.unchanged },
                { label: 'Source stops', value: preview.source_rows },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{s.value}</p>
                </div>
              ))}
            </div>

            {preview.skipped_zero > 0 ? (
              <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                {preview.skipped_zero} source stop(s) priced at ₹0 were skipped — a ₹0 fine cannot be
                raised, so those stops stay unpriced.
              </p>
            ) : null}

            {preview.to_overwrite > 0 ? (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  overwrite
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <p
                  className={
                    overwrite
                      ? 'font-medium text-amber-900 dark:text-amber-200'
                      : 'font-medium text-gray-700 dark:text-gray-200'
                  }
                >
                  {overwrite
                    ? `${preview.to_overwrite} stop(s) already priced will be REPLACED:`
                    : `${preview.to_overwrite} stop(s) already priced will be KEPT as they are:`}
                </p>
                <ul className="mt-1 space-y-0.5 text-gray-700 dark:text-gray-300">
                  {preview.sample_overwrite.map((s) => (
                    <li key={s.stop_id}>
                      {s.stop_name ?? s.stop_id}: {inr(s.previous ?? 0)} → {inr(s.fine_amount)}
                    </li>
                  ))}
                  {preview.to_overwrite > preview.sample_overwrite.length ? (
                    <li className="text-xs text-gray-500 dark:text-gray-400">
                      …and {preview.to_overwrite - preview.sample_overwrite.length} more.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={applying || previewing || !preview || preview.will_write === 0}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {preview ? `Copy ${preview.will_write} rate(s)` : 'Copy rates'}
          </button>
        </div>
      </div>
    </div>
  );
}
