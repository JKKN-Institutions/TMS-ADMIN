'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, Loader2, UploadCloud } from 'lucide-react';

interface StopRateRow {
  stop_id: string;
  stop_name: string;
  sequence_order: number;
  route_id: string;
  route_number: string | null;
  route_name: string | null;
  annual_amount: number | null;
}

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
 * or a "needs rate" marker. `canManage` gates the upload control only —
 * downloading the template and viewing rates stays available to anyone who can
 * see this page (the template/list endpoints only require view permission).
 */
export function StopRatesCard({ feeId, canManage }: { feeId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  // Cleared on every new upload attempt so a fixed-and-reuploaded sheet doesn't
  // leave stale errors from the previous attempt on screen.
  const [importErrors, setImportErrors] = useState<ImportRowError[] | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fee-stop-rates', feeId],
    queryFn: () => fetchStopRates(feeId),
  });

  const priced = rows.filter((r) => r.annual_amount !== null);

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
      // Invalidate the DERIVED key too: the structure detail query (and the
      // dry-run preview the operator runs next) both depend on stop rates
      // being current, and router.refresh() does not bust this cache.
      await qc.invalidateQueries({ queryKey: ['fee-stop-rates', feeId] });
      await qc.invalidateQueries({ queryKey: ['fee-structure', feeId] });
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) return <p className="text-sm text-gray-500">Loading stop rates…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/admin/fees/${feeId}/stop-rates/template`}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Download className="h-4 w-4" /> Download template
        </a>
        {canManage && (
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload filled sheet'}
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
        )}
        <span className="text-sm text-gray-500">
          {priced.length} of {rows.length} stops priced
        </span>
      </div>

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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
              <th className="py-2 pr-3">Route</th>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Stop</th>
              <th className="py-2 pr-3 text-right">Annual (₹)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stop_id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                <td className="py-1.5 pr-3 whitespace-nowrap text-gray-900 dark:text-gray-100">
                  {r.route_number} — {r.route_name}
                </td>
                <td className="py-1.5 pr-3 text-gray-500">{r.sequence_order}</td>
                <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">{r.stop_name}</td>
                <td className="py-1.5 pr-3 text-right">
                  {r.annual_amount === null ? (
                    <span className="text-amber-600 dark:text-amber-400">needs rate</span>
                  ) : (
                    <span className="text-gray-900 dark:text-gray-100">{r.annual_amount.toLocaleString('en-IN')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
