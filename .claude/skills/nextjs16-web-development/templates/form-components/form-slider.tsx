import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormSliderProps extends BaseFormFieldProps {
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  showValue?: boolean
  formatValue?: (value: number) => string
}

export function FormSlider({
  label,
  name,
  min = 0,
  max = 100,
  step = 1,
  defaultValue = 0,
  showValue = true,
  formatValue,
  description,
  error,
  required,
  disabled,
  className,
}: FormSliderProps) {
  const [value, setValue] = useState(defaultValue)

  const displayValue = formatValue ? formatValue(value) : value

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={name}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {showValue && <span className="text-sm font-medium">{displayValue}</span>}
      </div>

      <input type="hidden" name={name} value={value} />

      <Slider
        id={name}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(values) => setValue(values[0])}
        disabled={disabled}
        className={cn(error && 'border-destructive')}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${name}-error` : description ? `${name}-description` : undefined
        }
      />

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
