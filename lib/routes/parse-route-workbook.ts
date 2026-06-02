import * as XLSX from 'xlsx';
import { normalizeTime, computeDuration } from './normalize-time';

/**
 * Parses the JKKN "BUS STOPING TIMEING" workbook into route + stop records ready
 * for import. The workbook uses ONE worksheet per route, each laid out as:
 *
 *   row A : (blank)
 *   row B : "BUS ROUTE NAME : METTUR    BUS ROUTE NUMBAR : 5"   (merged title)
 *   row C : S.NO | STOPING PLACE | MORNING TIME | EVENING TIME  (header)
 *   row D+: 1    | THERMEL NAAL ROAD | 7-30 AM | 6-40 PM        (stops…)
 *                  …last stop is always COLLEGE…
 *
 * Design decisions baked in (see the import design analysis):
 *  - Route number/name come from the title cell, falling back to the tab name.
 *  - sequence_order is derived from ROW POSITION, never the S.NO column, which is
 *    non-sequential/duplicated/blank across many sheets.
 *  - Stop collection STOPS at the first COLLEGE row; this discards the duplicate
 *    rows pasted after COLLEGE on the route-31 sheet.
 *  - All time normalization/repair is delegated to normalizeTime() and recorded
 *    as warnings (best-effort import).
 */

export interface ParsedStop {
  stop_name: string;
  stop_time: string; // 'HH:MM:SS' — morning / inbound
  evening_time: string | null; // 'HH:MM:SS' — evening / outbound
  sequence_order: number;
  is_major_stop: boolean;
}

export interface ParsedRoute {
  route_number: string;
  route_name: string;
  route_code: string | null;
  start_location: string;
  end_location: string;
  departure_time: string; // 'HH:MM:SS'
  arrival_time: string; // 'HH:MM:SS'
  distance: number;
  duration: string;
  total_capacity: number;
  fare: number;
  status: 'active';
  stops: ParsedStop[];
}

export interface ParseWarning {
  sheet: string;
  routeNumber: string;
  row: number | null; // 1-based sheet row, for user reference
  stopName?: string;
  field: string;
  original: string;
  message: string;
}

export interface ParseResult {
  routes: ParsedRoute[];
  warnings: ParseWarning[];
  summary: {
    sheets: number;
    routes: number;
    stops: number;
    warnings: number;
    skippedSheets: string[];
  };
}

type Row = (string | number)[];

/** Fuzzy "is this the COLLEGE terminator row?" — tolerates the CPLLEGE typo. */
function isCollege(name: string): boolean {
  const n = name.toUpperCase().replace(/[^A-Z]/g, '');
  // COLLEGE, CPLLEGE, COLEGE… : C, an optional letter, then LLEGE / LEGE.
  return /^C[A-Z]?L+EGE$/.test(n);
}

/** Extract route number + name from the title cell, falling back to the tab name. */
function parseRouteHeader(title: string, sheetName: string): { number: string; name: string } {
  const t = (title || '').replace(/\s+/g, ' ').trim();
  let number = '';
  let name = '';

  const numMatch = t.match(/N(?:O|UMBA?R|UMBER)\b\s*:?\s*(\d+)/i);
  if (numMatch) number = numMatch[1];

  const nameMatch = t.match(/NAME\s*:?\s*(.+)/i);
  if (nameMatch) {
    // Cut at the next "BUS"/route-number keyword so we keep only the place name.
    name = nameMatch[1]
      .split(/\bBUS\b|N(?:O|UMBA?R|UMBER)\b/i)[0]
      .replace(/[:\-\s]+$/, '')
      .trim();
  }

  const sheetMatch = sheetName.match(/^(.*?)\s*NO\s*(\d+)\s*$/i);
  if (!number && sheetMatch) number = sheetMatch[2];
  if (!name) name = sheetMatch ? sheetMatch[1].trim() : sheetName.trim();
  if (!number) {
    const trailing = sheetName.match(/(\d+)\s*$/);
    if (trailing) number = trailing[1];
  }

  return { number, name };
}

function cell(row: Row | undefined, idx: number): string {
  if (!row) return '';
  return String(row[idx] ?? '').trim();
}

export function parseRouteWorkbook(wb: XLSX.WorkBook): ParseResult {
  const routes: ParsedRoute[] = [];
  const warnings: ParseWarning[] = [];
  const skippedSheets: string[] = [];
  let stopCount = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      skippedSheets.push(sheetName);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<Row>(ws, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: true,
    });

    // Locate the title row and header row by content (layout offset varies).
    const titleIdx = rows.findIndex((r) => r.some((c) => /BUS\s*ROUTE|ROUTE\s*NAME/i.test(String(c))));
    const titleCell = titleIdx >= 0 ? String(rows[titleIdx].find((c) => String(c).trim()) ?? '') : '';

    let headerIdx = rows.findIndex((r, i) => i > titleIdx && r.some((c) => /STOP/i.test(String(c))));
    if (headerIdx < 0) headerIdx = titleIdx >= 0 ? titleIdx + 1 : 0;

    const header = (rows[headerIdx] ?? []).map((c) => String(c).toUpperCase());
    let nameCol = header.findIndex((h) => /STOP|PLACE/.test(h));
    let morningCol = header.findIndex((h) => /MORNING/.test(h));
    let eveningCol = header.findIndex((h) => /EVENING/.test(h));
    // Fallbacks for the standard B-origin layout: S.NO | NAME | MORNING | EVENING.
    if (nameCol < 0) nameCol = 1;
    if (morningCol < 0) morningCol = nameCol + 1;
    if (eveningCol < 0) eveningCol = morningCol + 1;

    const { number, name } = parseRouteHeader(titleCell, sheetName);

    const stops: ParsedStop[] = [];
    let seq = 0;
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const stopName = cell(r, nameCol);
      if (!stopName) continue; // skip blank-name padding/orphan rows

      const sheetRow = i + 1; // 1-based for user-facing messages
      const morningRaw = cell(r, morningCol);
      const eveningRaw = cell(r, eveningCol);
      const mt = normalizeTime(morningRaw, 'morning');
      const et = normalizeTime(eveningRaw, 'evening');

      const college = isCollege(stopName);

      if (!mt.value) {
        // No usable morning time → cannot satisfy NOT NULL stop_time; skip + warn.
        warnings.push({
          sheet: sheetName,
          routeNumber: number,
          row: sheetRow,
          stopName,
          field: 'morning_time',
          original: morningRaw,
          message: `${mt.note ?? 'unparseable'} — stop skipped`,
        });
        if (college) break;
        continue;
      }

      seq += 1;
      if (mt.corrected) {
        warnings.push({
          sheet: sheetName,
          routeNumber: number,
          row: sheetRow,
          stopName,
          field: 'morning_time',
          original: morningRaw,
          message: mt.note ?? 'corrected',
        });
      }
      if (eveningRaw && (et.corrected || !et.value)) {
        warnings.push({
          sheet: sheetName,
          routeNumber: number,
          row: sheetRow,
          stopName,
          field: 'evening_time',
          original: eveningRaw,
          message: et.value ? et.note ?? 'corrected' : `${et.note ?? 'unparseable'} — left blank`,
        });
      }

      stops.push({
        stop_name: stopName,
        stop_time: mt.value,
        evening_time: et.value,
        sequence_order: seq,
        is_major_stop: false,
      });

      if (college) break; // COLLEGE is the destination + natural terminator
    }

    if (!stops.length) {
      skippedSheets.push(sheetName);
      continue;
    }

    // First stop + final stop (COLLEGE) are the major stops.
    stops[0].is_major_stop = true;
    stops[stops.length - 1].is_major_stop = true;

    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!number) {
      warnings.push({
        sheet: sheetName,
        routeNumber: '',
        row: null,
        field: 'route_number',
        original: titleCell || sheetName,
        message: 'could not determine a route number; route skipped',
      });
      continue;
    }

    routes.push({
      route_number: number,
      route_name: name || sheetName.trim(),
      route_code: sheetName.trim(),
      start_location: first.stop_name,
      end_location: last.stop_name,
      departure_time: first.stop_time,
      arrival_time: last.stop_time,
      distance: 0,
      duration: computeDuration(first.stop_time, last.stop_time),
      total_capacity: 0,
      fare: 0,
      status: 'active',
      stops,
    });
    stopCount += stops.length;
  }

  return {
    routes,
    warnings,
    summary: {
      sheets: wb.SheetNames.length,
      routes: routes.length,
      stops: stopCount,
      warnings: warnings.length,
      skippedSheets,
    },
  };
}
