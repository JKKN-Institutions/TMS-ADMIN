'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Download, FileUp, Loader2, UploadCloud, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { parseRouteWorkbook, type ParseResult } from '@/lib/routes/parse-route-workbook';
import { downloadRouteTemplate } from './route-export';

interface ImportApiResult {
  created: number;
  updated: number;
  failed: number;
  totalStops: number;
  results: { routeNumber: string; routeName: string; status: string; stops?: number; message?: string }[];
}

export function RouteImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported?: () => void;
}) {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportApiResult | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);

  const reset = () => {
    setParsed(null);
    setFileName('');
    setParseError(null);
    setResult(null);
    setShowWarnings(false);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const res = parseRouteWorkbook(wb);
      setParsed(res);
      setFileName(file.name);
      setResult(null);
      setParseError(res.routes.length === 0 ? 'No routes could be read from this workbook.' : null);
    } catch {
      setParseError('Could not read the file. Please upload a valid .xlsx or .csv workbook.');
      setParsed(null);
    }
  };

  const submit = async () => {
    if (!parsed?.routes.length) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/routes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: parsed.routes }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || 'Import failed');
      setResult(json as ImportApiResult);
      onImported?.();
      if (json.failed === 0) {
        toast.success(`Imported ${json.created} new + ${json.updated} updated route(s)`);
      } else {
        toast(`Imported with ${json.failed} error(s) — see report`, { icon: '⚠️' });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  const rowErrors = result?.results.filter((r) => r.status === 'error') ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && handleOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import routes from Excel</DialogTitle>
          <DialogDescription>
            Reads the JKKN bus-timing workbook (one sheet per route). Each route is matched by{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">route number</span> — existing routes are
            updated and their stops replaced; new ones are created. Distance, capacity and fare default to 0 and can be
            edited afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <button
            type="button"
            onClick={downloadRouteTemplate}
            className="inline-flex items-center gap-2 text-sm font-medium text-green-600 hover:underline"
          >
            <Download className="h-4 w-4" /> Download Excel template
          </button>

          {!result && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center transition-colors hover:border-green-400 hover:bg-green-50/50 dark:border-gray-700 dark:bg-gray-800/40 dark:hover:bg-green-500/5">
              <UploadCloud className="h-8 w-8 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {fileName ? (
                  <span className="font-medium text-gray-900 dark:text-gray-100">{fileName}</span>
                ) : (
                  'Click to upload .xlsx or .csv'
                )}
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
          )}

          {parseError && <p className="text-sm text-red-600">{parseError}</p>}

          {/* Pre-import preview */}
          {parsed && parsed.routes.length > 0 && !result && (
            <div className="space-y-3 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <FileUp className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">{parsed.summary.routes}</span> routes
                </span>
                <span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{parsed.summary.stops}</span> stops
                </span>
                {parsed.summary.skippedSheets.length > 0 && (
                  <span className="text-gray-500">{parsed.summary.skippedSheets.length} sheet(s) skipped</span>
                )}
              </div>

              {parsed.warnings.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowWarnings((s) => !s)}
                    className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400"
                  >
                    {showWarnings ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">{parsed.warnings.length} value(s) auto-corrected or skipped</span>
                  </button>
                  {showWarnings && (
                    <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                      {parsed.warnings.map((w, i) => (
                        <div key={i}>
                          <span className="font-medium">Route {w.routeNumber || '?'}</span>
                          {w.row ? ` · row ${w.row}` : ''}
                          {w.stopName ? ` · ${w.stopName}` : ''} · {w.field}: “{w.original}” → {w.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Post-import result */}
          {result && (
            <div className="space-y-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                Created {result.created} · Updated {result.updated} · Failed {result.failed} · {result.totalStops} stops
              </p>
              {rowErrors.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto text-red-600">
                  {rowErrors.map((e, i) => (
                    <div key={i}>
                      Route {e.routeNumber} ({e.routeName}): {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !parsed?.routes.length}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                </>
              ) : (
                `Import ${parsed?.routes.length || ''} route(s)`
              )}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
