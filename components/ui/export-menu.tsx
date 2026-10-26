'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ExportFormat } from '@/lib/export/table-export';

/**
 * The one Export button for list-page toolbars (Excel or PDF). Pages decide
 * which rows go out — the convention is: selected rows if any, otherwise the
 * rows currently shown by the filters.
 */
export function ExportMenu({
  onExport,
  selectedCount = 0,
  disabled,
}: {
  onExport: (format: ExportFormat) => Promise<void> | void;
  /** Rows selected in the table; shown on the button so it's clear what exports. */
  selectedCount?: number;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (format: ExportFormat) => {
    setBusy(true);
    try {
      await onExport(format);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy || disabled}
        className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
      >
        <Download className="h-4 w-4" />
        {busy ? 'Exporting…' : selectedCount ? `Export (${selectedCount})` : 'Export'}
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run('xlsx')}>
          <FileSpreadsheet className="text-gray-500" /> Export as Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('pdf')}>
          <FileText className="text-gray-500" /> Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
