// Shared Excel / PDF export for admin list pages, generalised from the Staff
// export. xlsx and jspdf are dynamically imported only when an export is
// clicked, keeping them out of every list page's first-load JS.

export type ExportFormat = 'xlsx' | 'pdf';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** Excel column width in characters (default 20). */
  width?: number;
}

export interface ExportOptions<T> {
  rows: T[];
  columns: ExportColumn<T>[];
  /** Heading on the PDF and the Excel sheet name, e.g. "Learners". */
  title: string;
  /** File name stem; the date is appended, e.g. "learners" -> learners-2026-10-26. */
  filename: string;
  /** Extra line under the PDF heading, e.g. "1,996 learners · 16 unassigned". */
  summary?: string;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function toRows<T>(rows: T[], columns: ExportColumn<T>[]): string[][] {
  return rows.map((r, i) => [String(i + 1), ...columns.map((c) => {
    const v = c.value(r);
    return v === null || v === undefined ? '' : String(v);
  })]);
}

async function exportExcel<T>({ rows, columns, title, filename }: ExportOptions<T>) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([['S.No', ...columns.map((c) => c.header)], ...toRows(rows, columns)]);
  ws['!cols'] = [{ wch: 6 }, ...columns.map((c) => ({ wch: c.width ?? 20 }))];
  const wb = XLSX.utils.book_new();
  // Sheet names are capped at 31 characters and may not contain [ ] : * ? / or a backslash.
  const sheetName = [...title].map((ch) => ('[]:*?/\\'.includes(ch) ? ' ' : ch)).join('').slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}-${today()}.xlsx`);
}

async function exportPdf<T>({ rows, columns, title, filename, summary }: ExportOptions<T>) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(14);
  doc.text(title, 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    [`Generated ${new Date().toLocaleString('en-IN')}`, `${rows.length} rows`, summary].filter(Boolean).join('  ·  '),
    40,
    52
  );

  autoTable(doc, {
    head: [['S.No', ...columns.map((c) => c.header)]],
    body: toRows(rows, columns),
    startY: 64,
    margin: { left: 24, right: 24 },
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 28, halign: 'right' } },
    didDrawPage: () => {
      const pageSize = doc.internal.pageSize;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageSize.getWidth() - 60, pageSize.getHeight() - 14);
    },
  });

  doc.save(`${filename}-${today()}.pdf`);
}

export async function exportTable<T>(format: ExportFormat, options: ExportOptions<T>) {
  if (format === 'pdf') await exportPdf(options);
  else await exportExcel(options);
}
