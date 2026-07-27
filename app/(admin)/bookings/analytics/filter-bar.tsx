'use client';

/**
 * Advanced filter bar for the Bookings analytics page. Owns the filter <-> query
 * string codec so a filtered view is bookmarkable and shareable.
 *
 * Facet options come from the API payload (only values actually present in the
 * range), NOT from /api/admin/masters, which is gated on FEES_VIEW.
 */

import React from 'react';
import { CalendarRange } from 'lucide-react';
import { MultiSelect, SingleSelect, FilterChips, type Chip } from './controls';
import { EMPTY_FILTERS, type AnalyticsFilters, type Facets } from '@/lib/booking/analytics';
import { addDays, istToday } from '@/lib/booking/window';

export const RANGES = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: '365d', label: 'Last 12 months', days: 365 },
] as const;

export type RangeId = (typeof RANGES)[number]['id'];

/** Default window: the last 30 days, ending today (IST). */
export function defaultRange(): { from: string; to: string } {
  const to = istToday();
  return { from: addDays(to, -29), to };
}

const MULTI_KEYS = {
  routeIds: 'route_id',
  stopIds: 'stop_id',
  institutionIds: 'institution_id',
  departmentIds: 'department_id',
  programIds: 'program_id',
} as const;

const SINGLE_KEYS = {
  bookedBy: 'booked_by',
  direction: 'direction',
  attStatus: 'att_status',
  method: 'method',
} as const;

export function serializeFilters(f: AnalyticsFilters, from: string, to: string): string {
  const sp = new URLSearchParams({ from, to });
  for (const [field, param] of Object.entries(MULTI_KEYS)) {
    const v = f[field as keyof typeof MULTI_KEYS];
    if (v.length) sp.set(param, v.join(','));
  }
  for (const [field, param] of Object.entries(SINGLE_KEYS)) {
    const v = f[field as keyof typeof SINGLE_KEYS];
    if (v) sp.set(param, v);
  }
  return sp.toString();
}

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const listOf = (v: string | null): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
const oneOf = <T extends string>(v: string | null, allowed: readonly T[]): T | null =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : null;

export function parseFilters(sp: URLSearchParams): {
  filters: AnalyticsFilters;
  from: string;
  to: string;
} {
  const d = defaultRange();
  return {
    from: isDate(sp.get('from')) ? (sp.get('from') as string) : d.from,
    to: isDate(sp.get('to')) ? (sp.get('to') as string) : d.to,
    filters: {
      routeIds: listOf(sp.get('route_id')),
      stopIds: listOf(sp.get('stop_id')),
      institutionIds: listOf(sp.get('institution_id')),
      departmentIds: listOf(sp.get('department_id')),
      programIds: listOf(sp.get('program_id')),
      bookedBy: oneOf(sp.get('booked_by'), ['self', 'admin'] as const),
      direction: oneOf(sp.get('direction'), ['onward', 'return'] as const),
      attStatus: oneOf(sp.get('att_status'), ['present', 'absent'] as const),
      method: oneOf(sp.get('method'), ['qr_scan', 'manual'] as const),
    },
  };
}

const BOOKED_BY_OPTS = [
  { id: 'self', label: 'Self-booked' },
  { id: 'admin', label: 'Booked by admin' },
];
const DIRECTION_OPTS = [
  { id: 'onward', label: 'Onward' },
  { id: 'return', label: 'Return' },
];
const STATUS_OPTS = [
  { id: 'present', label: 'Present' },
  { id: 'absent', label: 'Absent' },
];
const METHOD_OPTS = [
  { id: 'qr_scan', label: 'QR scan' },
  { id: 'manual', label: 'Manual' },
];

const dateInput =
  'h-[38px] rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function FilterBar({
  facets, filters, onFiltersChange, from, to, onRangeChange, showAttendanceFilters,
  showRange = true, resultLabel,
}: {
  facets: Facets;
  filters: AnalyticsFilters;
  onFiltersChange: (next: AnalyticsFilters) => void;
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  showAttendanceFilters: boolean;
  /**
   * The Upcoming tab runs on a fixed forward horizon rather than the selected
   * range, so it hides these controls instead of offering a picker that would
   * change nothing on screen.
   */
  showRange?: boolean;
  resultLabel: string;
}) {
  const set = <K extends keyof AnalyticsFilters>(k: K, v: AnalyticsFilters[K]) =>
    onFiltersChange({ ...filters, [k]: v });

  const applyPreset = (days: number) => {
    const end = istToday();
    onRangeChange(addDays(end, -(days - 1)), end);
  };

  // A preset is active iff the current range is exactly what it would set. Without
  // this the four buttons render identically whatever the range is, so there is no
  // way — visually or for a screen reader — to tell which one is in effect.
  const activePreset = RANGES.find(
    (r) => to === istToday() && from === addDays(to, -(r.days - 1))
  )?.id;

  // Stops narrow to the selected routes — an unfiltered 479-stop list is unusable.
  const stopOptions =
    filters.routeIds.length > 0
      ? facets.stops.filter((s) => s.routeId && filters.routeIds.includes(s.routeId))
      : facets.stops;

  const labelOf = (opts: { id: string; label: string }[], id: string) =>
    opts.find((o) => o.id === id)?.label ?? id;

  const chips: Chip[] = [
    ...filters.routeIds.map((id) => ({
      key: `route:${id}`, group: 'Route', label: labelOf(facets.routes, id),
      onRemove: () => set('routeIds', filters.routeIds.filter((v) => v !== id)),
    })),
    ...filters.stopIds.map((id) => ({
      key: `stop:${id}`, group: 'Stop', label: labelOf(facets.stops, id),
      onRemove: () => set('stopIds', filters.stopIds.filter((v) => v !== id)),
    })),
    ...filters.institutionIds.map((id) => ({
      key: `inst:${id}`, group: 'Institution', label: labelOf(facets.institutions, id),
      onRemove: () => set('institutionIds', filters.institutionIds.filter((v) => v !== id)),
    })),
    ...filters.departmentIds.map((id) => ({
      key: `dept:${id}`, group: 'Department', label: labelOf(facets.departments, id),
      onRemove: () => set('departmentIds', filters.departmentIds.filter((v) => v !== id)),
    })),
    ...filters.programIds.map((id) => ({
      key: `prog:${id}`, group: 'Program', label: labelOf(facets.programs, id),
      onRemove: () => set('programIds', filters.programIds.filter((v) => v !== id)),
    })),
    ...(filters.bookedBy
      ? [{ key: 'bookedBy', group: 'Booked by', label: labelOf(BOOKED_BY_OPTS, filters.bookedBy), onRemove: () => set('bookedBy', null) }]
      : []),
    ...(filters.direction
      ? [{ key: 'direction', group: 'Direction', label: labelOf(DIRECTION_OPTS, filters.direction), onRemove: () => set('direction', null) }]
      : []),
    ...(filters.attStatus
      ? [{ key: 'attStatus', group: 'Status', label: labelOf(STATUS_OPTS, filters.attStatus), onRemove: () => set('attStatus', null) }]
      : []),
    ...(filters.method
      ? [{ key: 'method', group: 'Method', label: labelOf(METHOD_OPTS, filters.method), onRemove: () => set('method', null) }]
      : []),
  ];

  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-card p-4"
      aria-label="Analytics filters"
    >
      <div className={`flex-wrap items-center gap-2 ${showRange ? 'flex' : 'hidden'}`}>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" /> Range
        </span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={activePreset === r.id}
              onClick={() => applyPreset(r.days)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                activePreset === r.id
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only sm:not-sr-only">From</span>
          <input
            type="date"
            className={dateInput}
            value={from}
            max={to}
            aria-label="Range start date"
            onChange={(e) => onRangeChange(e.target.value, to)}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only sm:not-sr-only">To</span>
          <input
            type="date"
            className={dateInput}
            value={to}
            min={from}
            aria-label="Range end date"
            onChange={(e) => onRangeChange(from, e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect title="Route" options={facets.routes} selected={filters.routeIds} onChange={(v) => set('routeIds', v)} />
        <MultiSelect title="Stop" options={stopOptions} selected={filters.stopIds} onChange={(v) => set('stopIds', v)} />
        <MultiSelect title="Institution" options={facets.institutions} selected={filters.institutionIds} onChange={(v) => set('institutionIds', v)} />
        <MultiSelect title="Department" options={facets.departments} selected={filters.departmentIds} onChange={(v) => set('departmentIds', v)} />
        <MultiSelect title="Program" options={facets.programs} selected={filters.programIds} onChange={(v) => set('programIds', v)} />
        <SingleSelect title="Booked by" options={BOOKED_BY_OPTS} value={filters.bookedBy} onChange={(v) => set('bookedBy', v as AnalyticsFilters['bookedBy'])} />
        {showAttendanceFilters && (
          <>
            <SingleSelect title="Direction" options={DIRECTION_OPTS} value={filters.direction} onChange={(v) => set('direction', v as AnalyticsFilters['direction'])} />
            <SingleSelect title="Status" options={STATUS_OPTS} value={filters.attStatus} onChange={(v) => set('attStatus', v as AnalyticsFilters['attStatus'])} />
            <SingleSelect title="Method" options={METHOD_OPTS} value={filters.method} onChange={(v) => set('method', v as AnalyticsFilters['method'])} />
          </>
        )}
      </div>

      <FilterChips chips={chips} onClearAll={() => onFiltersChange({ ...EMPTY_FILTERS })} />

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {resultLabel}
      </p>
    </section>
  );
}
