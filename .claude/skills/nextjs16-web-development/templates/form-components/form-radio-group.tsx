import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormRadioGroupProps extends BaseFormFieldProps {
  options: Array<{ value: string; label: string; description?: string }>
  defaultValue?: string
  orientation?: 'horizontal' | 'vertical'
}

export function FormRadioGroup({
  label,
  name,
  options,
  defaultValue,
  orientation = 'vertical',
  description,
  error,
  required,
  disabled,
  className,
}: FormRadioGroupProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <RadioGroup
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
        className={cn(
          orientation === 'horizontal' && 'flex flex-wrap gap-4',
          error && 'border-destructive'
        )}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${name}-error` : description ? `${name}-description` : undefined
        }
      >
        {options.map((option) => (
          <div key={option.value} className="flex items-start space-x-3">
            <RadioGroupItem value={option.value} id={`${name}-${option.value}`} />
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
      </RadioGroup>

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
