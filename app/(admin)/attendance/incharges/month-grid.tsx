'use client';

/**
 * Month grid: one row per in-charge, one square per day, coloured by whether
 * they scanned. Repeat offenders show as a row of red/amber squares. Click a
 * day number to open that day above.
 */

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MARKING_LABEL, isSundayDate, type MarkingRow, type MarkingStatus } from '@/lib/attendance/incharge-marking';

const CELL: Record<MarkingStatus, string> = {
  marked: 'bg-green-500',
  others: 'bg-amber-400',
  missed: 'bg-red-500',
  leave: 'bg-sky-500',
  pending: 'bg-white ring-1 ring-inset ring-gray-300',
  off: 'bg-gray-100',
  na: 'bg-transparent',
};

const LEGEND: MarkingStatus[] = ['marked', 'others', 'missed', 'leave', 'pending', 'off'];

type Sort = 'worst' | 'bus' | 'name';

const dayNum = (d: string) => Number(d.slice(8));
const weekdayLetter = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'narrow', timeZone: 'UTC' });

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
  const [sort, setSort] = useState<Sort>('worst');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? rows.filter((r) => `${r.name} ${r.email} ${r.routeNumber ?? ''} ${r.routeName ?? ''}`.toLowerCase().includes(needle))
      : [...rows];
    if (sort === 'worst') {
      // Lowest marked % first; people with no duty days go last.
      list.sort((a, b) => (a.markedPct ?? 101) - (b.markedPct ?? 101) || b.missedDays - a.missedDays);
    } else if (sort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [rows, q, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search in-charge or bus..."
            aria-label="Search in-charge or bus"
            className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm"
          />
        </label>
        <div className="inline-flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Sort">
          {([['worst', 'Lowest first'], ['bus', 'By bus'], ['name', 'By name']] as Array<[Sort, string]>).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={sort === k}
              onClick={() => setSort(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${sort === k ? 'bg-green-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {LEGEND.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm ${CELL[s]}`} aria-hidden="true" />
            {MARKING_LABEL[s]}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#f0fdf4] text-[0.7rem] font-bold uppercase tracking-wider text-[#166534]">
              <th scope="col" className="sticky left-0 z-10 min-w-48 bg-[#f0fdf4] px-3 py-2 text-left">In-charge</th>
              {days.map((d) => (
                <th key={d} scope="col" className="px-0 py-1 text-center font-semibold">
                  <button
                    type="button"
                    onClick={() => onPickDate(d)}
                    disabled={d > today}
                    title={`Show ${d}`}
                    className={`flex w-7 flex-col items-center rounded-md py-0.5 hover:bg-green-100 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${
                      d === selected ? 'bg-green-600 text-white hover:bg-green-600' : isSundayDate(d) ? 'text-gray-400' : ''
                    }`}
                  >
                    <span className="text-[0.6rem] leading-none">{weekdayLetter(d)}</span>
                    <span className="text-xs leading-tight">{dayNum(d)}</span>
                  </button>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-center">Marked</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={days.length + 2} className="px-3 py-8 text-center text-muted-foreground">
                  No in-charge matches.
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.assignmentId} className="border-t border-border hover:bg-gray-50/60">
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-normal">
                  <p className="truncate font-semibold text-gray-900">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Bus {r.routeNumber ?? '—'} {r.routeName ?? ''}
                  </p>
                </th>
                {days.map((d) => {
                  const c = r.cells[d];
                  const tip =
                    c.s === 'na'
                      ? undefined
                      : `${d} · ${MARKING_LABEL[c.s]}${c.n ? ` · scanned ${c.n}` : ''}${c.bus ? ` of ${c.bus} on the bus` : ''}${
                          c.first ? ` · ${c.first}–${c.last}` : ''
                        }`;
                  return (
                    <td key={d} className="px-0 py-1.5 text-center">
                      <span
                        title={tip}
                        className={`mx-auto block h-5 w-5 rounded ${CELL[c.s]} ${d === selected ? 'outline-2 outline-offset-1 outline-green-700' : ''}`}
                      >
                        <span className="sr-only">{tip}</span>
                      </span>
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-1.5 text-center tabular-nums">
                  {r.markedPct === null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <>
                      <span
                        className={`font-bold ${r.markedPct >= 75 ? 'text-green-700' : r.markedPct >= 50 ? 'text-amber-700' : 'text-red-700'}`}
                      >
                        {r.markedPct}%
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.markedDays}/{r.dutyDays} days
                      </span>
                    </>
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
