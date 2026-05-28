import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormTextareaProps extends BaseFormFieldProps {
  placeholder?: string
  defaultValue?: string
  rows?: number
  maxLength?: number
  showCounter?: boolean
}

export function FormTextarea({
  label,
  name,
  placeholder,
  defaultValue,
  rows = 4,
  maxLength,
  showCounter = false,
  description,
  error,
  required,
  disabled,
  className,
}: FormTextareaProps) {
  const [charCount, setCharCount] = useState(defaultValue?.length || 0)

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={name}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {showCounter && maxLength && (
          <span className="text-xs text-muted-foreground">
            {charCount}/{maxLength}
          </span>
        )}
      </div>

      <Textarea
        id={name}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        rows={rows}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        className={cn(error && 'border-destructive focus-visible:ring-destructive')}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${name}-error` : description ? `${name}-description` : undefined
        }
        onChange={(e) => setCharCount(e.target.value.length)}
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
