'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, Loader2, UploadCloud } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { buildRatePayload, dirtyStopIds, effectiveAmount } from '@/lib/fees/stop-rate-draft';
import { getStopRateColumns, type StopRateRow } from './stop-rates-columns';

interface ImportRowError {
  row: number;
  message: string;
}

async function fetchStopRates(feeId: string): Promise<StopRateRow[]> {
  const res = await fetch(`/api/admin/fees/${feeId}/stop-rates`, { cache: 'no-store', credentials: 'same-origin' });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'Failed to load stop rates');
  return json.data.rates as StopRateRow[];
}

/**
 * Every stop on every route for this fee structure, with its configured rate
 * or a "needs rate" marker. `canManage` gates inline editing and the upload
 * control — downloading the template and viewing rates stays available to
 * anyone who can see this page (the template/list endpoints only require view
 * permission).
 *
 * Rates are typed into a draft and written in one batch on Save, which is the
 * only sane way to correct a single stop in a ~479-row price list; the Excel
 * round-trip stays for bulk re-pricing.
 */
export function StopRatesCard({ feeId, canManage }: { feeId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Raw input strings keyed by stop_id, held until Save. Keyed by id (not row
  // index) so a background refetch that reorders rows cannot move an edit onto
  // a different stop.
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Cleared on every new upload attempt so a fixed-and-reuploaded sheet doesn't
  // leave stale errors from the previous attempt on screen.
  const [importErrors, setImportErrors] = useState<ImportRowError[] | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fee-stop-rates', feeId],
    queryFn: () => fetchStopRates(feeId),
  });

  // Counts read the EFFECTIVE amount so "N of M priced" tracks what is on
  // screen, not what was last saved.
  const priced = rows.filter((r) => effectiveAmount(r, draft) !== null);
  const dirtyCount = dirtyStopIds(rows, draft).length;

  const onChange = useCallback(
    (stopId: string, value: string) => setDraft((d) => ({ ...d, [stopId]: value })),
    []
  );

  const columns = useMemo(
    () => getStopRateColumns(canManage, onChange, draft),
    [canManage, onChange, draft]
  );

  async function save() {
    const { rates, invalid } = buildRatePayload(rows, draft);
    if (invalid.length) {
      // buildRatePayload is all-or-nothing: nothing is sent while any edited box
      // is unparseable, so a typo cannot half-apply a price list.
      const names = invalid
        .map((i) => rows.find((r) => r.stop_id === i.stop_id)?.stop_name ?? i.stop_id)
        .slice(0, 3)
        .join(', ');
      toast.error(`Fix ${invalid.length} invalid amount(s) first: ${names}`);
      return;
    }
    if (!rates.length) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/fees/${feeId}/stop-rates`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || 'Save failed');
      toast.success(json.message ?? 'Stop rates saved');
      setDraft({});
      // Invalidate the DERIVED key too: the structure detail query (and the
      // dry-run preview the operator runs next) both depend on stop rates
      // being current, and router.refresh() does not bust this cache.
      await qc.invalidateQueries({ queryKey: ['fee-stop-rates', feeId] });
      await qc.invalidateQueries({ queryKey: ['fee-structure', feeId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(file: File) {
    setUploading(true);
    setImportErrors(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/fees/${feeId}/stop-rates/import`, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        // The import is all-or-nothing server-side, so a 400 here means NOTHING
        // was written. Surface every rejected row with its sheet row number —
        // a bare "import failed" is unactionable against a 479-row sheet.
        const errs: ImportRowError[] = json?.data?.errors ?? [];
        setImportErrors(errs);
        toast.error(json.error ?? 'Import failed');
        return;
      }
      toast.success(json.message ?? 'Imported');
      // The accepted sheet is authoritative: keeping unsaved inline edits would
      // let a later Save silently undo part of the import.
      setDraft({});
      await qc.invalidateQueries({ queryKey: ['fee-stop-rates', feeId] });
      await qc.invalidateQueries({ queryKey: ['fee-structure', feeId] });
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) return <p className="text-sm text-gray-500">Loading stop rates…</p>;

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm text-gray-600 dark:text-gray-300">
        {canManage
          ? 'Type an annual amount against a stop and press Save. Clearing a box removes that stop’s rate and makes it unbillable. '
          : 'The annual amount charged per boarding stop. '}
        <span className="text-amber-700 dark:text-amber-500">
          Changing a rate does not re-price bills that already exist — it applies to bills generated
          from now on.
        </span>{' '}
        <span className="text-gray-500 dark:text-gray-400">
          {priced.length} of {rows.length} stops priced.
        </span>
      </p>

      {importErrors && importErrors.length > 0 && (
        <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-500/10">
          <p className="font-medium text-red-800 dark:text-red-300">
            {importErrors.length} row(s) rejected — nothing was imported.
          </p>
          <div className="max-h-40 space-y-0.5 overflow-y-auto text-red-700 dark:text-red-400">
            {importErrors.map((e, i) => (
              <div key={`${e.row}-${i}`}>
                Row {e.row}: {e.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        entityName="stops"
        getRowId={(r) => r.stop_id}
        enableRowSelection={false}
        searchPlaceholder="Search stop or route..."
        filters={[
          {
            columnId: 'priced',
            title: 'Status',
            options: [
              { label: 'Priced', value: 'priced' },
              { label: 'Needs rate', value: 'unpriced' },
            ],
          },
        ]}
        toolbarActions={() => (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/admin/fees/${feeId}/stop-rates/template`}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Download className="h-4 w-4" /> Template
            </a>
            {canManage && (
              <>
                <label className="inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                  {uploading ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUpload(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || dirtyCount === 0}
                  className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save{dirtyCount ? ` (${dirtyCount})` : ''}
                </button>
              </>
            )}
          </div>
        )}
      />
    </div>
  );
}
