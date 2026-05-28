import { Label } from '@/components/ui/label'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { cn } from '@/lib/utils'
import { REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormOTPProps extends BaseFormFieldProps {
  length?: number
  pattern?: string
  separator?: boolean
}

export function FormOTP({
  label,
  name,
  length = 6,
  pattern = REGEXP_ONLY_DIGITS_AND_CHARS,
  separator = true,
  description,
  error,
  required,
  disabled,
  className,
}: FormOTPProps) {
  const halfLength = Math.ceil(length / 2)
  const renderSlots = () => {
    if (!separator) {
      return (
        <InputOTPGroup>
          {Array.from({ length }).map((_, index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      )
    }

    return (
      <>
        <InputOTPGroup>
          {Array.from({ length: halfLength }).map((_, index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {Array.from({ length: length - halfLength }).map((_, index) => (
            <InputOTPSlot key={index + halfLength} index={index + halfLength} />
          ))}
        </InputOTPGroup>
      </>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <InputOTP
        id={name}
        name={name}
        maxLength={length}
        pattern={pattern}
        disabled={disabled}
        required={required}
        containerClassName={cn(error && 'border-destructive')}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${name}-error` : description ? `${name}-description` : undefined
        }
      >
        {renderSlots()}
      </InputOTP>

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
