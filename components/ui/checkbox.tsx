'use client';

import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'checked' | 'type'> {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
}

// Native-button checkbox (no extra Radix dependency) with shadcn-compatible API:
// `checked` accepts true | false | 'indeterminate', `onCheckedChange` returns a boolean.
const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ checked = false, onCheckedChange, disabled, className, ...props }, ref) => {
    const indeterminate = checked === 'indeterminate';
    const isChecked = checked === true;
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : isChecked}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!(isChecked || indeterminate))}
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
          isChecked || indeterminate ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white',
          className
        )}
        {...props}
      >
        {indeterminate ? <Minus className="h-3 w-3" /> : isChecked ? <Check className="h-3 w-3" /> : null}
      </button>
    );
  }
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
