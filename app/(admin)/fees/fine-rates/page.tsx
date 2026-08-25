'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Copy, Download, Loader2, UploadCloud } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SelectMenu } from '@/components/ui/select-menu';
import { fetchTransportYearOptions } from '../fee-api';
import { getFineRateColumns, type FineRateRow } from './fine-rate-columns';
import { CopyRatesDialog } from './copy-rates-dialog';

async function fetchFineRates(year: string): Promise<FineRateRow[]> {
  const res = await fetch(`/api/admin/fees/fine-rates?year=${encodeURIComponent(year)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'Failed to load fine rates');
  return json.data.rates as FineRateRow[];
}

interface ImportRowError {
  row: number;
  message: string;
}

export default function FineRatesPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importErrors, setImportErrors] = useState<ImportRowError[] | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const { data: years = [] } = useQuery({
    queryKey: ['transport-year-options'],
    queryFn: fetchTransportYearOptions,
  });

  // Default to the most recent year once the list loads. In an effect, not in
  // the render body — setting state during render risks an update loop.
  useEffect(() => {
    if (!year && years.length) setYear(years[0].id);
  }, [years, year]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fine-rates', year],
    queryFn: () => fetchFineRates(year),
    enabled: !!year,
  });

  const onChange = useCallback(
    (stopId: string, value: string) => setDraft((d) => ({ ...d, [stopId]: value })),
    []
  );

  const columns = useMemo(() => getFineRateColumns(true, onChange, draft), [onChange, draft]);
  const priced = rows.filter((r) => r.fine_amount !== null).length;
  const dirtyCount = Object.keys(draft).length;

  async function save() {
    setSaving(true);
    try {
      const rates = Object.entries(draft).map(([stop_id, v]) => ({
        stop_id,
        fine_amount: v.trim() === '' ? null : Number(v),
      }));
      const res = await fetch('/api/admin/fees/fine-rates', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, rates }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || 'Save failed');
      toast.success(json.message ?? 'Fine rates saved');
      setDraft({});
      // Invalidate rather than relying on a refresh: router.refresh() does NOT
      // bust the TanStack cache, and a stale row here reads as "my edit didn't save".
      await qc.invalidateQueries({ queryKey: ['fine-rates', year] });
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
      fd.append('year', year);
      const res = await fetch('/api/admin/fees/fine-rates/import', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        // The import is all-or-nothing server-side, so a 400 here means NOTHING
        // was written. Surface every rejected row with its sheet row number.
        setImportErrors(json?.data?.errors ?? []);
        throw new Error(json.error || 'Import failed');
      }
      toast.success(json.message ?? 'Imported');
      setDraft({});
      await qc.invalidateQueries({ queryKey: ['fine-rates', year] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose text-sm text-gray-600 dark:text-gray-300">
          The fine amount charged per boarding stop. Applies to every learner on that stop, whichever
          fee structure bills them. {priced} of {rows.length} stop(s) priced.
        </p>
        <div className="w-full sm:w-64">
          <SelectMenu
            value={year}
            onValueChange={(v) => {
              setYear(v);
              setDraft({});
            }}
            options={years.map((y) => ({ value: y.id, label: y.name }))}
            placeholder="Select transport year…"
            ariaLabel="Transport year"
          />
        </div>
      </div>

      {importErrors?.length ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-500/10">
          <p className="font-medium text-red-800 dark:text-red-300">
            Nothing was saved — fix these rows and re-upload:
          </p>
          <ul className="mt-2 list-disc pl-5 text-red-700 dark:text-red-300">
            {importErrors.slice(0, 20).map((e) => (
              <li key={e.row}>
                Row {e.row}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        entityName="stops"
        isLoading={isLoading}
        getRowId={(r) => r.stop_id}
        searchPlaceholder="Search route or stop..."
        toolbarActions={() => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCopyOpen(true)}
              disabled={!year}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Copy className="h-4 w-4" />
              Copy from fee structure
            </button>
            <a
              href={`/api/admin/fees/fine-rates/template?year=${encodeURIComponent(year)}`}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Download className="h-4 w-4" />
              Template
            </a>
            <label className="inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              Upload
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={save}
              disabled={saving || dirtyCount === 0}
              className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save{dirtyCount ? ` (${dirtyCount})` : ''}
            </button>
          </div>
        )}
      />

      <CopyRatesDialog
        open={copyOpen}
        year={year}
        onClose={() => setCopyOpen(false)}
        onDone={() => {
          // Drop any typed-but-unsaved drafts: they were entered against the
          // pre-copy amounts and saving them afterwards would silently undo the copy.
          setDraft({});
          qc.invalidateQueries({ queryKey: ['fine-rates', year] });
        }}
      />
    </div>
  );
}
