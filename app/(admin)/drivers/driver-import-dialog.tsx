'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, FileUp, Loader2, UploadCloud } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { downloadDriverTemplate } from './driver-export';

interface ImportResult {
  updated: number;
  failed: number;
  results: { row: number; status: 'updated' | 'error'; message?: string }[];
}

export function DriverImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setRows([]);
    setFileName('');
    setParseError(null);
    setResult(null);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      setRows(json);
      setFileName(file.name);
      setParseError(null);
      setResult(null);
    } catch {
      setParseError('Could not read the file. Please upload a valid .xlsx or .csv file.');
      setRows([]);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/drivers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Import failed');
      return json as ImportResult & { success: boolean };
    },
    onSuccess: (json) => {
      setResult(json);
      qc.invalidateQueries({ queryKey: ['drivers'] });
      if (json.failed === 0) toast.success(`Imported ${json.updated} driver record(s)`);
      else toast(`Imported ${json.updated}, ${json.failed} failed`, { icon: '⚠️' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const errors = result?.results.filter((r) => r.status === 'error') ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && handleOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import driver details</DialogTitle>
          <DialogDescription>
            Updates TMS operational fields (license, status, trips…) for existing drivers, matched by{' '}
            <span className="font-medium text-gray-900">staffId</span> or{' '}
            <span className="font-medium text-gray-900">email</span>. Drivers must already exist in MyJKKN.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <button
            type="button"
            onClick={downloadDriverTemplate}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
          >
            <Download className="h-4 w-4" /> Download Excel template
          </button>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-500/5">
            <UploadCloud className="h-8 w-8 text-gray-400" />
            <span className="text-sm text-gray-600">
              {fileName ? <span className="font-medium text-gray-900">{fileName}</span> : 'Click to upload .xlsx or .csv'}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>

          {parseError && <p className="text-sm text-red-600">{parseError}</p>}
          {rows.length > 0 && !result && (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <FileUp className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-900">{rows.length}</span> row(s) ready to import
            </p>
          )}

          {result && (
            <div className="space-y-2 rounded-lg border border-gray-200 p-3 text-sm">
              <p className="font-medium text-gray-900">
                Imported {result.updated} · Failed {result.failed}
              </p>
              {errors.length > 0 && (
                <div className="max-h-32 space-y-1 overflow-y-auto text-red-600">
                  {errors.map((e) => (
                    <div key={e.row}>Row {e.row}: {e.message}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <button type="button" className="btn-secondary" onClick={() => handleOpenChange(false)} disabled={mutation.isPending}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || rows.length === 0}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : `Import ${rows.length || ''}`}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
