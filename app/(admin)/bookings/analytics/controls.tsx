'use client';

/**
 * Filter and shell primitives for the Bookings analytics page.
 *
 * Everything here uses the app's SEMANTIC tokens (border-border, bg-card,
 * text-foreground, hover:bg-muted) rather than hand-rolled gray/white pairs, so
 * dark mode works without per-element `dark:` variants.
 *
 * The existing components/ui/data-table.tsx::FilterSelect is single-select and
 * hardcodes light-mode grays, so it is not reused here.
 */

import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Info, Search, X, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { card } from '../../_viz/kit';

/** Shared trigger geometry — matches the 38px controls used across the admin app. */
export const control =
  'inline-flex h-[38px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm ' +
  'font-medium text-foreground transition-colors duration-200 hover:bg-muted cursor-pointer ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1';

export interface Opt {
  id: string;
  label: string;
}

/**
 * Multi-select dropdown with an inline search box once the list is long.
 *
 * Two Radix gotchas handled here:
 *  1. `onSelect` must preventDefault or the menu closes after every toggle.
 *  2. The menu's typeahead swallows keystrokes, so the search input stops
 *     propagation of its own keydown events.
 */
export function MultiSelect({
  title, options, selected, onChange, searchThreshold = 8,
}: {
  title: string;
  options: Opt[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchThreshold?: number;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);

  const label =
    selected.length === 0
      ? `${title}: All`
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.label ?? `${title}: 1`)
        : `${title}: ${selected.length}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${control} min-w-0 max-w-56 justify-between`}
        aria-label={`Filter by ${title}`}
        disabled={options.length === 0}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-64 overflow-y-auto"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {options.length > searchThreshold && (
          <div className="sticky top-0 z-10 bg-popover p-1.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder={`Search ${title.toLowerCase()}…`}
                aria-label={`Search ${title}`}
                className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>
        )}

        {selected.length > 0 && (
          <>
            <DropdownMenuItem onSelect={() => onChange([])} className="cursor-pointer">
              <X className="h-4 w-4" aria-hidden="true" /> Clear {title.toLowerCase()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {shown.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">No matches</p>
        ) : (
          shown.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.id}
              checked={selected.includes(o.id)}
              onSelect={(e) => {
                e.preventDefault(); // keep the menu open across multiple toggles
                toggle(o.id);
              }}
              className="cursor-pointer"
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single-select dropdown for the enum filters (booked-by, direction, status, method). */
export function SingleSelect({
  title, options, value, onChange,
}: {
  title: string;
  options: Opt[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${control} min-w-0 max-w-48 justify-between`}
        aria-label={`Filter by ${title}`}
      >
        <span className="truncate">{selected ? selected.label : `${title}: All`}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuItem onSelect={() => onChange(null)} className="cursor-pointer">
          <Check className={value ? 'opacity-0' : 'opacity-100'} aria-hidden="true" /> {title}: All
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => onChange(o.id)} className="cursor-pointer">
            <Check className={value === o.id ? 'opacity-100' : 'opacity-0'} aria-hidden="true" />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface Chip {
  key: string;
  group: string;
  label: string;
  onRemove: () => void;
}

/** Active-filter chips. Renders nothing when no filter is set. */
export function FilterChips({ chips, onClearAll }: { chips: Chip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted py-1 pl-2.5 pr-1 text-xs text-foreground"
        >
          <span className="text-muted-foreground">{c.group}</span>
          <span className="truncate font-medium">{c.label}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Remove filter ${c.group} ${c.label}`}
            className="cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors duration-200 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors duration-200 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Clear all
      </button>
    </div>
  );
}

export interface TabDef {
  id: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * Accessible tab bar: real `tablist`/`tab` roles with roving tabindex and
 * left/right arrow navigation, which a plain row of buttons does not provide.
 */
export function TabNav({
  tabs, active, onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].id);
    else if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
    else return;
    e.preventDefault();
  };

  return (
    <div className="border-b border-border">
      <div role="tablist" aria-label="Analytics sections" onKeyDown={onKeyDown} className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                on
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.Icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Coverage disclosure for the Attendance tab. Attendance currently exists for a
 * small minority of routes and days; without this note the charts read as
 * fleet-wide. Tone escalates to warning below 50% route coverage. The icon plus
 * the text mean colour is never the only signal.
 */
export function CoverageCallout({
  routesWithAttendance, routesInRange, daysWithAttendance, daysInRange,
}: {
  routesWithAttendance: number;
  routesInRange: number;
  daysWithAttendance: number;
  daysInRange: number;
}) {
  const thin = routesInRange > 0 && routesWithAttendance / routesInRange < 0.5;
  const color = thin ? 'var(--viz-warning)' : 'var(--viz-good)';
  return (
    <section
      className={`${card} flex items-start gap-3 p-4`}
      style={{ borderColor: color }}
      aria-live="polite"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        Attendance recorded on{' '}
        <span className="font-semibold text-foreground">
          {routesWithAttendance} of {routesInRange}
        </span>{' '}
        routes across{' '}
        <span className="font-semibold text-foreground">
          {daysWithAttendance} of {daysInRange}
        </span>{' '}
        booked days in this range.
        {thin && ' Figures below cover scanned routes and days only — they are not fleet-wide.'}
      </p>
    </section>
  );
}
