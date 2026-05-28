import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormDatePickerProps extends BaseFormFieldProps {
  defaultValue?: Date
  minDate?: Date
  maxDate?: Date
  placeholder?: string
}

export function FormDatePicker({
  label,
  name,
  defaultValue,
  minDate,
  maxDate,
  placeholder = 'Pick a date',
  description,
  error,
  required,
  disabled,
  className,
}: FormDatePickerProps) {
  const [date, setDate] = useState<Date | undefined>(defaultValue)

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <input type="hidden" name={name} value={date ? date.toISOString() : ''} />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={name}
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal',
              !date && 'text-muted-foreground',
              error && 'border-destructive focus:ring-destructive'
            )}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${name}-error` : description ? `${name}-description` : undefined
            }
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, 'PPP') : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            disabled={(date) => {
              if (minDate && date < minDate) return true
              if (maxDate && date > maxDate) return true
              return false
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {description && !error && (
        <p id={`${name}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}

      {error && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
