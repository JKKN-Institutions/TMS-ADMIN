import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormCheckboxGroupProps extends BaseFormFieldProps {
  options: Array<{ value: string; label: string; description?: string }>
  defaultValue?: string[]
  orientation?: 'horizontal' | 'vertical'
}

export function FormCheckboxGroup({
  label,
  name,
  options,
  defaultValue = [],
  orientation = 'vertical',
  description,
  error,
  required,
  disabled,
  className,
}: FormCheckboxGroupProps) {
  const [selectedValues, setSelectedValues] = useState<string[]>(defaultValue)

  const handleCheckedChange = (value: string, checked: boolean) => {
    setSelectedValues(
      checked
        ? [...selectedValues, value]
        : selectedValues.filter((v) => v !== value)
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {/* Hidden inputs for form submission */}
      {selectedValues.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      <div
        className={cn(
          'space-y-3',
          orientation === 'horizontal' && 'flex flex-wrap gap-4 space-y-0'
        )}
        role="group"
        aria-invalid={!!error}
        aria-describedby={
          error ? `${name}-error` : description ? `${name}-description` : undefined
        }
      >
        {options.map((option) => (
          <div key={option.value} className="flex items-start space-x-3">
            <Checkbox
              id={`${name}-${option.value}`}
              checked={selectedValues.includes(option.value)}
              onCheckedChange={(checked) =>
                handleCheckedChange(option.value, checked as boolean)
              }
              disabled={disabled}
              className={cn(error && 'border-destructive')}
            />
            <div className="space-y-1 leading-none">
              <Label
                htmlFor={`${name}-${option.value}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {option.label}
              </Label>
              {option.description && (
                <p className="text-sm text-muted-foreground">{option.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>

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
