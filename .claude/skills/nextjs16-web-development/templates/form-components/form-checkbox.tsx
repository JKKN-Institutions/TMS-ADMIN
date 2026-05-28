import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormCheckboxProps extends Omit<BaseFormFieldProps, 'label'> {
  label: string | React.ReactNode
  defaultChecked?: boolean
}

export function FormCheckbox({
  label,
  name,
  description,
  error,
  required,
  disabled,
  defaultChecked,
  className,
}: FormCheckboxProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start space-x-3">
        <Checkbox
          id={name}
          name={name}
          defaultChecked={defaultChecked}
          required={required}
          disabled={disabled}
          className={cn(error && 'border-destructive')}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${name}-error` : description ? `${name}-description` : undefined
          }
        />
        <div className="space-y-1 leading-none">
          <Label
            htmlFor={name}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {description && !error && (
            <p id={`${name}-description`} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
