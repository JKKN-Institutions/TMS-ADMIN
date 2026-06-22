'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SelectMenuOption } from './select-menu';

interface SelectMenuMultiProps {
  /** Currently-selected option values. */
  value: string[];
  onValueChange: (value: string[]) => void;
  options: SelectMenuOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes for the trigger button. */
  className?: string;
  id?: string;
  ariaLabel?: string;
}

/**
 * Multi-select counterpart to SelectMenu (components/ui/select-menu.tsx). Same
 * Radix dropdown-menu primitives, `.input` trigger look, rounded-xl menu and
 * green hover — but each row is a toggle (checkbox), the menu STAYS OPEN while
 * selecting (onSelect preventDefault), and the trigger summarises the picks.
 *
 * Empty selection = "any" for condition filters that treat no value as no
 * filter (e.g. tms_fee_structure.institution_ids).
 */
export function SelectMenuMulti({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  className,
  id,
  ariaLabel,
}: SelectMenuMultiProps) {
  const selectedSet = new Set(value);
  const selectedLabels = options.filter((o) => selectedSet.has(o.value)).map((o) => o.label);

  const summary =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(', ')
        : `${selectedLabels.length} selected`;

  const toggle = (val: string) => {
    onValueChange(selectedSet.has(val) ? value.filter((v) => v !== val) : [...value, val]);
  };

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          className={cn(
            'group input flex items-center justify-between gap-2 bg-white text-left',
            'data-[state=open]:ring-2 data-[state=open]:ring-green-500/40',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          <span className={cn('truncate', selectedLabels.length ? '' : 'text-gray-400')}>
            {summary}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-md"
        >
          {options.length === 0 && (
            <div className="px-2 py-2 text-sm text-gray-400">No options</div>
          )}
          {options.map((o) => {
            const checked = selectedSet.has(o.value);
            return (
              <DropdownMenuPrimitive.Item
                key={o.value}
                // Keep the menu open so several options can be toggled in one go.
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(o.value);
                }}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm text-gray-700 outline-none transition-colors hover:bg-green-100 focus:bg-green-100 dark:text-gray-200 dark:hover:bg-green-500/15 dark:focus:bg-green-500/15"
              >
                {checked && (
                  <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </span>
                )}
                <span className="truncate">{o.label}</span>
              </DropdownMenuPrimitive.Item>
            );
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
