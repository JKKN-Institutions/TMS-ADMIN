import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormInputProps extends BaseFormFieldProps {
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url'
  placeholder?: string
  defaultValue?: string | number
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  maxLength?: number
}

export function FormInput({
  label,
  name,
  type = 'text',
  placeholder,
  defaultValue,
  description,
  error,
  required,
  disabled,
  prefix,
  suffix,
  maxLength,
  className,
}: FormInputProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <div className="relative">
        {prefix && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {prefix}
          </div>
        )}

        <Input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          className={cn(
            error && 'border-destructive focus-visible:ring-destructive',
            prefix && 'pl-10',
            suffix && 'pr-10'
          )}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${name}-error` : description ? `${name}-description` : undefined
          }
        />

        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {suffix}
          </div>
        )}
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
