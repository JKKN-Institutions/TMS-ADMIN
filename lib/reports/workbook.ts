/**
 * SERVER ONLY. Turns sheet rows into an .xlsx download.
 *
 * Built here rather than in the browser because a report export must cover the
 * whole filtered result, not the page the table happens to hold: every other
 * export in this app works from rows already in memory, which is why none of
 * them can export a term's worth of attendance.
 */
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import type { SheetRow } from './sheets';

/** Roughly how wide each column should be, from its header and its values. */
function columnWidths(rows: SheetRow[]): Array<{ wch: number }> {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  return headers.map((h) => {
    let widest = h.length;
    // A sample is enough: scanning 50k rows to size a column is not worth it.
    for (const row of rows.slice(0, 200)) {
      const len = String(row[h] ?? '').length;
      if (len > widest) widest = len;
    }
    return { wch: Math.min(Math.max(widest + 2, 8), 40) };
  });
}

export function xlsxResponse(sheetName: string, rows: SheetRow[], fileName: string): NextResponse {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = columnWidths(rows);
  // Freeze the header row so a long list keeps its column names in view.
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  const book = XLSX.utils.book_new();
  // Excel refuses a sheet name over 31 characters or containing []:*?/\
  XLSX.utils.book_append_sheet(book, sheet, sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31));
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
