'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectMenuOption {
  value: string;
  label: string;
}

interface SelectMenuProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectMenuOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes for the trigger button (e.g. spacing). */
  className?: string;
  id?: string;
  ariaLabel?: string;
}

/**
 * Form-friendly select built on the SAME Radix dropdown-menu primitives as the
 * row-action menus (components/ui/dropdown-menu.tsx), so its rounded corners
 * (rounded-xl) and green hover match the rest of the TMS dropdowns.
 *
 * Use for in-form enum/reference pickers: a native <select> can't be styled
 * (its option list is OS-rendered), so it can't carry the radius or the green
 * hover. The trigger reuses the `.input` look so it sits flush with the other
 * form fields, including dark mode.
 */
export function SelectMenu({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  className,
  id,
  ariaLabel,
}: SelectMenuProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          className={cn(
            // `.input` carries the base look (border, radius, padding, dark mode);
            // these utilities are all non-conflicting so they survive its cascade.
            'group input flex items-center justify-between gap-2 bg-white text-left',
            'data-[state=open]:ring-2 data-[state=open]:ring-green-500/40',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          <span className={cn('truncate', selected ? '' : 'text-gray-400')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          // Match the trigger width and the drivers dropdown styling: rounded-xl
          // corners + green-hover items.
          className="z-50 max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-md"
        >
          {options.map((o) => (
            <DropdownMenuPrimitive.Item
              key={o.value || '__empty__'}
              onSelect={() => onValueChange(o.value)}
              className="relative flex cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm text-gray-700 outline-none transition-colors hover:bg-green-100 focus:bg-green-100 dark:text-gray-200 dark:hover:bg-green-500/15 dark:focus:bg-green-500/15"
            >
              {o.value === value && (
                <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                </span>
              )}
              <span className="truncate">{o.label}</span>
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
