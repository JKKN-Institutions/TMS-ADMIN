'use client';

/**
 * Month view: one row per in-charge, one cell per working day.
 *
 * Built to be read at a glance:
 *   - only days that have happened and on which buses ran are columns (Sundays,
 *     holidays and future days are hidden unless asked for), so the cells are
 *     wide enough to carry a symbol and the scan count, not just a colour;
 *   - quick filters with counts ("Never marked", "Below 75%"...) instead of a
 *     167-row wall, and 20 rows per page;
 *   - "Group by bus" puts a bus's in-charges together, so a bus nobody scanned
 *     reads as one bus problem rather than five red people;
 *   - a footer row gives each day's "scanned / on duty".
 * Click a date to open that day in the table above.
 */

import { Fragment, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import {
  DUTY_STATUSES, MARKING_LABEL, isSundayDate, type MarkingRow, type MarkingStatus,
} from '@/lib/attendance/incharge-marking';

// Colour + symbol, never colour alone.
const CELL: Record<MarkingStatus, { box: string; Icon?: typeof Check }> = {
  marked: { box: 'bg-green-600 text-white', Icon: Check },
  missed: { box: 'bg-red-600 text-white', Icon: X },
  off: { box: 'bg-gray-100 text-gray-300' },
  na: { box: '' },
};

const LEGEND: Array<{ s: MarkingStatus; hint: string }> = [
  { s: 'marked', hint: 'scanned learners themselves (number = how many)' },
  { s: 'missed', hint: 'did not scan any learner' },
];

type Band = 'all' | 'never' | 'low' | 'good';
type View = 'worst' | 'bus' | 'name';
const PAGE = 20;

const pctTone = (p: number) => (p >= 75 ? 'bg-green-600' : p >= 50 ? 'bg-amber-500' : 'bg-red-600');
const pctText = (p: number) => (p >= 75 ? 'text-green-700' : p >= 50 ? 'text-amber-700' : 'text-red-700');
const band = (r: MarkingRow): Exclude<Band, 'all'> | null =>
  r.markedPct === null ? null : r.markedPct === 0 ? 'never' : r.markedPct < 75 ? 'low' : 'good';
const busKey = (r: MarkingRow) => r.routeNumber ?? '—';
const byBus = (a: MarkingRow, b: MarkingRow) =>
  busKey(a).localeCompare(busKey(b), undefined, { numeric: true }) || a.name.localeCompare(b.name);

const dayNum = (d: string) => Number(d.slice(8));
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });

export function MonthGrid({
  rows, days, selected, today, onPickDate,
}: {
  rows: MarkingRow[];
  days: string[];
  selected: string;
  today: string;
  onPickDate: (d: string) => void;
}) {
  const [q, setQ] = useState('');
  const [bandSel, setBand] = useState<Band>('all');
  const [view, setView] = useState<View>('worst');
  const [allDays, setAllDays] = useState(false);
  const [page, setPage] = useState(0);

  // Working days only: past/today, and at least one in-charge was on duty.
  const cols = useMemo(() => {
    const past = days.filter((d) => d <= today);
    if (allDays) return past;
    return past.filter((d) => rows.some((r) => DUTY_STATUSES.has(r.cells[d]?.s)));
  }, [days, today, rows, allDays]);
  const hiddenDays = days.filter((d) => d <= today).length - cols.length;

  const counts = useMemo(() => {
    const c = { all: rows.length, never: 0, low: 0, good: 0 };
    for (const r of rows) {
      const b = band(r);
      if (b) c[b]++;
    }
    return c;
  }, [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (bandSel === 'all' || band(r) === bandSel) &&
        (!needle || `${r.name} ${r.email} ${r.routeNumber ?? ''} ${r.routeName ?? ''}`.toLowerCase().includes(needle)),
    );
    if (view === 'worst') out.sort((a, b) => (a.markedPct ?? 101) - (b.markedPct ?? 101) || b.missedDays - a.missedDays || byBus(a, b));
    else if (view === 'bus') out.sort(byBus);
    else out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [rows, q, bandSel, view]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = list.slice(at * PAGE, at * PAGE + PAGE);

  // Footer: per day, how many on-duty in-charges scanned (over the filtered list).
  const perDay = useMemo(
    () =>
      cols.map((d) => {
        let duty = 0, marked = 0;
        for (const r of list) {
          const s = r.cells[d]?.s;
          if (s && DUTY_STATUSES.has(s)) duty++;
          if (s === 'marked') marked++;
        }
        return { d, duty, marked };
      }),
    [cols, list],
  );

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };

  const CHIPS: Array<{ k: Band; label: string; tone: string }> = [
    { k: 'all', label: 'All in-charges', tone: 'bg-gray-900 text-white' },
    { k: 'never', label: 'Never marked', tone: 'bg-red-600 text-white' },
    { k: 'low', label: 'Below 75%', tone: 'bg-amber-500 text-white' },
    { k: 'good', label: '75% and above', tone: 'bg-green-600 text-white' },
  ];

  return (
    <div className="space-y-4">
      {/* Quick filters with counts */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {CHIPS.map((c) => {
          const on = bandSel === c.k;
          return (
            <button
              key={c.k}
              type="button"
              aria-pressed={on}
              onClick={() => reset(setBand)(c.k)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                on ? `${c.tone} border-transparent` : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {c.label}
              <span className={`rounded-full px-2 text-xs font-bold tabular-nums ${on ? 'bg-white/25' : 'bg-gray-100 text-gray-700'}`}>
                {counts[c.k]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search, order, days */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
            placeholder="Search in-charge or bus..."
            aria-label="Search in-charge or bus"
            className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm"
          />
        </label>
        <div className="inline-flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Order">
          {([['worst', 'Lowest first'], ['bus', 'Group by bus'], ['name', 'By name']] as Array<[View, string]>).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              onClick={() => reset(setView)(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === k ? 'bg-green-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} className="h-4 w-4 accent-green-600" />
          Show Sundays &amp; holidays
        </label>
      </div>

      {/* Legend */}
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-600" aria-label="Legend">
        {LEGEND.map(({ s, hint }) => {
          const { box, Icon } = CELL[s];
          return (
            <li key={s} className="inline-flex items-center gap-1.5" title={hint}>
              <span className={`flex h-5 w-5 items-center justify-center rounded ${box}`} aria-hidden="true">
                {Icon && <Icon className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="font-medium text-gray-800">{MARKING_LABEL[s]}</span>
              <span className="hidden text-gray-500 lg:inline">· {hint}</span>
            </li>
          );
        })}
        <li className="inline-flex items-center gap-1.5 text-gray-500">
          <span className="h-5 w-5 rounded bg-gray-100" aria-hidden="true" />
          not counted (on leave or holiday)
        </li>
      </ul>

      {cols.length === 0 ? (
        <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          No working day in this month yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#f0fdf4] text-[#166534]">
                <th scope="col" className="sticky left-0 z-10 min-w-56 bg-[#f0fdf4] px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider">
                  In-charge
                </th>
                {cols.map((d) => {
                  const sel = d === selected;
                  return (
                    <th key={d} scope="col" className={`px-1 py-1.5 ${sel ? 'bg-green-100' : ''}`}>
                      <button
                        type="button"
                        onClick={() => onPickDate(d)}
                        title={`Open ${d} above`}
                        className={`mx-auto flex w-11 flex-col items-center rounded-lg py-1 transition-colors ${
                          sel ? 'bg-green-600 text-white' : isSundayDate(d) ? 'text-gray-400 hover:bg-green-100' : 'hover:bg-green-100'
                        }`}
                      >
                        <span className="text-[0.65rem] font-semibold uppercase leading-none">{weekday(d)}</span>
                        <span className="text-base font-bold leading-tight">{dayNum(d)}</span>
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="min-w-40 px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider">
                  Marked days
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2} className="px-4 py-10 text-center text-muted-foreground">
                    No in-charge matches.
                  </td>
                </tr>
              )}
              {shown.map((r, i) => {
                const newBus = view === 'bus' && (i === 0 || busKey(shown[i - 1]) !== busKey(r));
                const busMates = newBus ? list.filter((x) => busKey(x) === busKey(r)) : [];
                // Days the whole bus went unscanned: every in-charge Not marked and no scans on the bus.
        const busMissed = newBus
          ? cols.filter((d) => busMates.every((x) => x.cells[d]?.s === 'missed' && x.cells[d]?.bus === 0)).length
          : 0;
                return (
                  <Fragment key={r.assignmentId}>
                    {newBus && (
                      <tr className="border-t-2 border-green-200 bg-green-50/60">
                        <th colSpan={cols.length + 2} scope="rowgroup" className="sticky left-0 px-4 py-2 text-left">
                          <span className="inline-flex items-center gap-2">
                            <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-green-600 px-1.5 text-xs font-bold text-white">
                              {r.routeNumber ?? '—'}
                            </span>
                            <span className="font-semibold text-gray-900">{r.routeName ?? 'Unknown bus'}</span>
                            <span className="text-xs text-gray-500">· {busMates.length} in-charge{busMates.length === 1 ? '' : 's'}</span>
                            {busMissed > 0 && (
                              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                                bus not scanned on {busMissed} day{busMissed === 1 ? '' : 's'}
                              </span>
                            )}
                          </span>
                        </th>
                      </tr>
                    )}
                    <tr className="border-t border-border hover:bg-gray-50">
                      <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-2 text-left font-normal">
                        <p className="truncate font-semibold text-gray-900">{r.name}</p>
                        {view !== 'bus' && (
                          <p className="truncate text-xs text-gray-500">
                            Bus {r.routeNumber ?? '—'} · {r.routeName ?? ''}
                          </p>
                        )}
                      </th>
                      {cols.map((d) => {
                        const c = r.cells[d];
                        const { box, Icon } = CELL[c.s];
                        const tip =
                          c.s === 'na'
                            ? 'Not assigned yet'
                            : `${weekday(d)} ${dayNum(d)} · ${MARKING_LABEL[c.s]}${c.n ? ` · scanned ${c.n}` : ''}${
                                c.bus ? ` of ${c.bus} on the bus` : ''
                              }${c.first ? ` · ${c.first}–${c.last}` : ''}`;
                        return (
                          <td key={d} className={`px-1 py-1.5 text-center ${d === selected ? 'bg-green-50' : ''}`}>
                            <span title={tip} className={`mx-auto flex h-8 w-11 items-center justify-center gap-0.5 rounded-md text-xs font-bold ${box}`}>
                              {c.s === 'marked' ? (
                                <span className="tabular-nums">{c.n}</span>
                              ) : Icon ? (
                                <Icon className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                              ) : null}
                              <span className="sr-only">{tip}</span>
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-4 py-2">
                        {r.markedPct === null ? (
                          <span className="text-xs text-gray-400">no working days</span>
                        ) : (
                          <div className="min-w-36">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className={`text-sm font-bold tabular-nums ${pctText(r.markedPct)}`}>{r.markedPct}%</span>
                              <span className="text-xs tabular-nums text-gray-500">
                                {r.markedDays} of {r.dutyDays} days
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                              <div className={`h-full rounded-full ${pctTone(r.markedPct)}`} style={{ width: `${Math.max(r.markedPct, 2)}%` }} />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 text-xs">
                  <th scope="row" className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left font-semibold text-gray-700">
                    Marked that day
                  </th>
                  {perDay.map(({ d, duty, marked }) => (
                    <td key={d} className={`px-1 py-2 text-center tabular-nums ${d === selected ? 'bg-green-50' : ''}`}>
                      {duty === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className={`font-bold ${pctText(Math.round((marked / duty) * 100))}`} title={`${marked} of ${duty} in-charges on duty marked`}>
                          {marked}/{duty}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-gray-500">in-charges on duty</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Paging + note */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <p>
          {list.length === 0 ? 'No in-charges' : `Showing ${at * PAGE + 1}–${Math.min(list.length, at * PAGE + PAGE)} of ${list.length} in-charges`}
          {!allDays && hiddenDays > 0 && <span className="text-gray-400"> · {hiddenDays} Sunday/holiday column{hiddenDays === 1 ? '' : 's'} hidden</span>}
        </p>
        {pages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button" aria-label="Previous page" disabled={at === 0} onClick={() => setPage(at - 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 tabular-nums">
              Page {at + 1} of {pages}
            </span>
            <button
              type="button" aria-label="Next page" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
