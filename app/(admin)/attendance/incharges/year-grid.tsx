'use client';

/**
 * Year view: one row per in-charge, one cell per month showing the % of
 * working days they scanned themselves. Click a month to open its month view.
 */

import { Fragment, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { PeriodSummary, YearRow } from '@/lib/attendance/incharge-marking';

type Band = 'all' | 'never' | 'low' | 'good';
type View = 'worst' | 'bus' | 'name';
const PAGE = 20;

const band = (p: number | null): Exclude<Band, 'all'> | null =>
  p === null ? null : p === 0 ? 'never' : p < 75 ? 'low' : 'good';
const cellTone = (p: number) =>
  p >= 75 ? 'bg-green-600 text-white' : p >= 50 ? 'bg-amber-400 text-amber-950' : 'bg-red-600 text-white';
const pctText = (p: number) => (p >= 75 ? 'text-green-700' : p >= 50 ? 'text-amber-700' : 'text-red-700');
const pctBar = (p: number) => (p >= 75 ? 'bg-green-600' : p >= 50 ? 'bg-amber-500' : 'bg-red-600');
const busKey = (r: YearRow) => r.routeNumber ?? '—';
const byBus = (a: YearRow, b: YearRow) =>
  busKey(a).localeCompare(busKey(b), undefined, { numeric: true }) || a.name.localeCompare(b.name);
const monthShort = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });

function tip(m: string, s: PeriodSummary) {
  if (s.pct === null) return `${monthShort(m)} · no working days`;
  return `${monthShort(m)} · marked on ${s.marked} of ${s.duty} working days · not marked on ${s.missed}`;
}

export function YearGrid({ rows, months, onPickMonth }: { rows: YearRow[]; months: string[]; onPickMonth: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [bandSel, setBand] = useState<Band>('all');
  const [view, setView] = useState<View>('worst');
  const [page, setPage] = useState(0);

  // Months in which anyone had a working day.
  const cols = useMemo(() => months.filter((m) => rows.some((r) => r.months[m]?.pct !== null)), [months, rows]);

  const counts = useMemo(() => {
    const c = { all: rows.length, never: 0, low: 0, good: 0 };
    for (const r of rows) {
      const b = band(r.total.pct);
      if (b) c[b]++;
    }
    return c;
  }, [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (bandSel === 'all' || band(r.total.pct) === bandSel) &&
        (!needle || `${r.name} ${r.email} ${r.routeNumber ?? ''} ${r.routeName ?? ''}`.toLowerCase().includes(needle)),
    );
    if (view === 'worst') out.sort((a, b) => (a.total.pct ?? 101) - (b.total.pct ?? 101) || byBus(a, b));
    else if (view === 'bus') out.sort(byBus);
    else out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [rows, q, bandSel, view]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = list.slice(at * PAGE, at * PAGE + PAGE);
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
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {CHIPS.map((c) => {
          const on = bandSel === c.k;
          return (
            <button
              key={c.k} type="button" aria-pressed={on} onClick={() => reset(setBand)(c.k)}
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

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search in-charge or bus..."
            aria-label="Search in-charge or bus" className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm"
          />
        </label>
        <div className="inline-flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Order">
          {([['worst', 'Lowest first'], ['bus', 'Group by bus'], ['name', 'By name']] as Array<[View, string]>).map(([k, label]) => (
            <button
              key={k} type="button" aria-pressed={view === k} onClick={() => reset(setView)(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === k ? 'bg-green-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-600" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5"><span className="h-4 w-6 rounded bg-green-600" aria-hidden="true" />75% or more of working days marked</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-4 w-6 rounded bg-amber-400" aria-hidden="true" />50–74%</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-4 w-6 rounded bg-red-600" aria-hidden="true" />below 50%</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-4 w-6 rounded bg-gray-100" aria-hidden="true" />no working days</li>
      </ul>

      {cols.length === 0 ? (
        <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">No attendance in this year yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#f0fdf4] text-[#166534]">
                <th scope="col" className="sticky left-0 z-10 min-w-56 bg-[#f0fdf4] px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider">
                  In-charge
                </th>
                {cols.map((m) => (
                  <th key={m} scope="col" className="px-1 py-1.5">
                    <button
                      type="button" onClick={() => onPickMonth(m)} title={`Open ${monthShort(m)} month view`}
                      className="mx-auto block w-16 rounded-lg py-1.5 text-sm font-bold hover:bg-green-100"
                    >
                      {monthShort(m)}
                    </button>
                  </th>
                ))}
                <th scope="col" className="min-w-40 px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider">Year</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2} className="px-4 py-10 text-center text-muted-foreground">No in-charge matches.</td>
                </tr>
              )}
              {shown.map((r, i) => {
                const newBus = view === 'bus' && (i === 0 || busKey(shown[i - 1]) !== busKey(r));
                const mates = newBus ? list.filter((x) => busKey(x) === busKey(r)).length : 0;
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
                            <span className="text-xs text-gray-500">· {mates} in-charge{mates === 1 ? '' : 's'}</span>
                          </span>
                        </th>
                      </tr>
                    )}
                    <tr className="border-t border-border hover:bg-gray-50">
                      <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-2 text-left font-normal">
                        <p className="truncate font-semibold text-gray-900">{r.name}</p>
                        {view !== 'bus' && <p className="truncate text-xs text-gray-500">Bus {r.routeNumber ?? '—'} · {r.routeName ?? ''}</p>}
                      </th>
                      {cols.map((m) => {
                        const s = r.months[m];
                        return (
                          <td key={m} className="px-1 py-1.5 text-center">
                            <span
                              title={tip(m, s)}
                              className={`mx-auto flex h-9 w-16 flex-col items-center justify-center rounded-md leading-tight ${
                                s.pct === null ? 'bg-gray-100 text-gray-300' : cellTone(s.pct)
                              }`}
                            >
                              {s.pct === null ? (
                                '—'
                              ) : (
                                <>
                                  <span className="text-sm font-bold tabular-nums">{s.pct}%</span>
                                  <span className="text-[0.65rem] tabular-nums opacity-90">{s.marked}/{s.duty}</span>
                                </>
                              )}
                              <span className="sr-only">{tip(m, s)}</span>
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-4 py-2">
                        {r.total.pct === null ? (
                          <span className="text-xs text-gray-400">no working days</span>
                        ) : (
                          <div className="min-w-36">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className={`text-sm font-bold tabular-nums ${pctText(r.total.pct)}`}>{r.total.pct}%</span>
                              <span className="text-xs tabular-nums text-gray-500">{r.total.marked} of {r.total.duty} days</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                              <div className={`h-full rounded-full ${pctBar(r.total.pct)}`} style={{ width: `${Math.max(r.total.pct, 2)}%` }} />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <p>{list.length === 0 ? 'No in-charges' : `Showing ${at * PAGE + 1}–${Math.min(list.length, at * PAGE + PAGE)} of ${list.length} in-charges`}</p>
        {pages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button" aria-label="Previous page" disabled={at === 0} onClick={() => setPage(at - 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 tabular-nums">Page {at + 1} of {pages}</span>
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
