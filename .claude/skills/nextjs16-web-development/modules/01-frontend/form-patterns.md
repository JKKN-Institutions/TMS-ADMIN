# Form Patterns

Standardized form components with React Hook Form + Zod validation.

## Overview

This module provides 12 reusable form components that integrate seamlessly with:
- **React Hook Form 7.x**: Form state management
- **Zod 4.x**: Schema validation
- **Shadcn UI**: Base UI components
- **TypeScript**: Type safety

All components share a common interface (`BaseFormFieldProps`) for consistency.

---

## Base Interface

### BaseFormFieldProps

Shared interface for all form components:

```typescript
// types/form.ts
export interface BaseFormFieldProps {
  label: string
  name: string
  description?: string
  error?: string
  required?: boolean
  disabled?: boolean
  className?: string
}
```

---

## 1. FormInput

Text input field with validation.

### Features
- Text, email, password, number, tel, url types
- Prefix and suffix support
- Character counter
- Error states

### Component

```tsx
// components/forms/form-input.tsx
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from '@/types/form'

interface FormInputProps extends BaseFormFieldProps {
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url'
  placeholder?: string
  defaultValue?: string | number
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  maxLength?: number
  showCounter?: boolean
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
  showCounter,
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
          aria-describedby={error ? `${name}-error` : description ? `${name}-description` : undefined}
        />

        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {suffix}
          </div>
        )}
      </div>

      {showCounter && maxLength && (
        <div className="text-xs text-muted-foreground text-right">
          0 / {maxLength}
        </div>
      )}

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
```

### Usage

```tsx
<FormInput
  label="Email Address"
  name="email"
  type="email"
  placeholder="you@example.com"
  required
  error={state.errors?.email?.[0]}
/>
```

---

## 2. FormSelect

Dropdown select component.

### Component

```tsx
// components/forms/form-select.tsx
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from '@/types/form'

interface FormSelectProps extends BaseFormFieldProps {
  options: Array<{ value: string; label: string }>
  placeholder?: string
  defaultValue?: string
}

export function FormSelect({
  label,
  name,
  options,
  placeholder = 'Select an option',
  defaultValue,
  description,
  error,
  required,
  disabled,
  className,
}: FormSelectProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <Select name={name} defaultValue={defaultValue} disabled={disabled}>
        <SelectTrigger
          id={name}
          className={cn(error && 'border-destructive')}
          aria-invalid={!!error}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {description && !error && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

### Usage

```tsx
<FormSelect
  label="Category"
  name="category_id"
  options={[
    { value: '1', label: 'Electronics' },
    { value: '2', label: 'Clothing' },
  ]}
  error={state.errors?.category_id?.[0]}
/>
```

---

## 3. FormCheckbox

Single checkbox component.

### Component

```tsx
// components/forms/form-checkbox.tsx
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FormCheckboxProps {
  label: string
  name: string
  description?: string
  error?: string
  defaultChecked?: boolean
  disabled?: boolean
  className?: string
}

export function FormCheckbox({
  label,
  name,
  description,
  error,
  defaultChecked,
  disabled,
  className,
}: FormCheckboxProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center space-x-2">
        <Checkbox
          id={name}
          name={name}
          defaultChecked={defaultChecked}
          disabled={disabled}
          aria-invalid={!!error}
        />
        <Label
          htmlFor={name}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
        </Label>
      </div>

      {description && !error && (
        <p className="text-sm text-muted-foreground ml-6">{description}</p>
      )}

      {error && <p className="text-sm text-destructive ml-6">{error}</p>}
    </div>
  )
}
```

### Usage

```tsx
<FormCheckbox
  label="I agree to the terms and conditions"
  name="agree_terms"
  required
/>
```

---

## 4. FormRadioGroup

Radio button group component.

### Component

```tsx
// components/forms/form-radio-group.tsx
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from '@/types/form'

interface FormRadioGroupProps extends BaseFormFieldProps {
  options: Array<{ value: string; label: string; description?: string }>
  defaultValue?: string
}

export function FormRadioGroup({
  label,
  name,
  options,
  defaultValue,
  description,
  error,
  required,
  disabled,
  className,
}: FormRadioGroupProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <RadioGroup name={name} defaultValue={defaultValue} disabled={disabled}>
        {options.map((option) => (
          <div key={option.value} className="flex items-center space-x-2">
            <RadioGroupItem value={option.value} id={`${name}-${option.value}`} />
            <Label
              htmlFor={`${name}-${option.value}`}
              className="font-normal cursor-pointer"
            >
              <div>{option.label}</div>
              {option.description && (
                <div className="text-sm text-muted-foreground">
                  {option.description}
                </div>
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {description && !error && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

### Usage

```tsx
<FormRadioGroup
  label="Delivery Method"
  name="delivery_method"
  options={[
    { value: 'standard', label: 'Standard (5-7 days)', description: 'Free' },
    { value: 'express', label: 'Express (2-3 days)', description: '$10.00' },
  ]}
/>
```

---

## 5. FormDatePicker

Date picker component.

### Component

```tsx
// components/forms/form-date-picker.tsx
'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from '@/types/form'

interface FormDatePickerProps extends BaseFormFieldProps {
  defaultValue?: Date
  minDate?: Date
  maxDate?: Date
}

export function FormDatePicker({
  label,
  name,
  defaultValue,
  minDate,
  maxDate,
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

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !date && 'text-muted-foreground',
              error && 'border-destructive'
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, 'PPP') : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            fromDate={minDate}
            toDate={maxDate}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>

      {/* Hidden input to submit value */}
      <input
        type="hidden"
        name={name}
        value={date ? format(date, 'yyyy-MM-dd') : ''}
      />

      {description && !error && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

### Usage

```tsx
<FormDatePicker
  label="Start Date"
  name="start_date"
  minDate={new Date()}
  required
/>
```

---

## 6. FormTextarea

Multi-line text input.

### Component

```tsx
// components/forms/form-textarea.tsx
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from '@/types/form'

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
  showCounter,
  description,
  error,
  required,
  disabled,
  className,
}: FormTextareaProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <Textarea
        id={name}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        rows={rows}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        className={cn(error && 'border-destructive')}
        aria-invalid={!!error}
      />

      {showCounter && maxLength && (
        <div className="text-xs text-muted-foreground text-right">
          0 / {maxLength}
        </div>
      )}

      {description && !error && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

### Usage

```tsx
<FormTextarea
  label="Description"
  name="description"
  placeholder="Enter product description..."
  rows={6}
  maxLength={500}
  showCounter
/>
```

---

## 7. FormSlider

Range slider component.

### Component

```tsx
// components/forms/form-slider.tsx
'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from '@/types/form'

interface FormSliderProps extends BaseFormFieldProps {
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  formatValue?: (value: number) => string
}

export function FormSlider({
  label,
  name,
  min = 0,
  max = 100,
  step = 1,
  defaultValue = 50,
  formatValue,
  description,
  error,
  required,
  disabled,
  className,
}: FormSliderProps) {
  const [value, setValue] = useState(defaultValue)

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={name}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <span className="text-sm font-medium">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>

      <Slider
        id={name}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(values) => setValue(values[0])}
        disabled={disabled}
      />

      {/* Hidden input */}
      <input type="hidden" name={name} value={value} />

      {description && !error && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

### Usage

```tsx
<FormSlider
  label="Price Range"
  name="max_price"
  min={0}
  max={1000}
  step={10}
  defaultValue={500}
  formatValue={(v) => `$${v}`}
/>
```

---

## 8. FormSwitch

Toggle switch component.

### Component

```tsx
// components/forms/form-switch.tsx
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface FormSwitchProps {
  label: string
  name: string
  description?: string
  error?: string
  defaultChecked?: boolean
  disabled?: boolean
  className?: string
}

export function FormSwitch({
  label,
  name,
  description,
  error,
  defaultChecked,
  disabled,
  className,
}: FormSwitchProps) {
  return (
    <div className={cn('flex items-center justify-between space-x-2', className)}>
      <div className="space-y-0.5 flex-1">
        <Label htmlFor={name}>{label}</Label>
        {description && !error && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Switch
        id={name}
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
      />
    </div>
  )
}
```

### Usage

```tsx
<FormSwitch
  label="Publish immediately"
  name="is_published"
  description="Make this product visible to customers"
/>
```

---

## 9. FormFileUpload

File upload component with preview.

### Component

```tsx
// components/forms/form-file-upload.tsx
'use client'

import { useState } from 'react'
import { Upload, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from '@/types/form'

interface FormFileUploadProps extends BaseFormFieldProps {
  accept?: string
  maxSize?: number // in MB
  multiple?: boolean
}

export function FormFileUpload({
  label,
  name,
  accept = 'image/*',
  maxSize = 5,
  multiple = false,
  description,
  error,
  required,
  disabled,
  className,
}: FormFileUploadProps) {
  const [files, setFiles] = useState<File[]>([])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    setFiles(selectedFiles)
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center',
          error && 'border-destructive'
        )}
      >
        <input
          id={name}
          name={name}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          required={required}
          disabled={disabled}
          className="hidden"
        />

        <Label
          htmlFor={name}
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            Click to upload or drag and drop
          </div>
          <div className="text-xs text-muted-foreground">
            {accept} (max {maxSize}MB)
          </div>
        </Label>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-muted rounded"
            >
              <span className="text-sm truncate">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeFile(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {description && !error && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

### Usage

```tsx
<FormFileUpload
  label="Product Images"
  name="images"
  accept="image/png,image/jpeg"
  maxSize={10}
  multiple
/>
```

---

## 10. FormCheckboxGroup

Multiple checkbox selection.

### Component

```tsx
// components/forms/form-checkbox-group.tsx
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from '@/types/form'

interface FormCheckboxGroupProps extends BaseFormFieldProps {
  options: Array<{ value: string; label: string }>
  defaultValues?: string[]
}

export function FormCheckboxGroup({
  label,
  name,
  options,
  defaultValues = [],
  description,
  error,
  required,
  disabled,
  className,
}: FormCheckboxGroupProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <div className="space-y-2">
        {options.map((option) => (
          <div key={option.value} className="flex items-center space-x-2">
            <Checkbox
              id={`${name}-${option.value}`}
              name={name}
              value={option.value}
              defaultChecked={defaultValues.includes(option.value)}
              disabled={disabled}
            />
            <Label
              htmlFor={`${name}-${option.value}`}
              className="text-sm font-normal cursor-pointer"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </div>

      {description && !error && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

### Usage

```tsx
<FormCheckboxGroup
  label="Features"
  name="features"
  options={[
    { value: 'wifi', label: 'WiFi' },
    { value: 'bluetooth', label: 'Bluetooth' },
    { value: 'nfc', label: 'NFC' },
  ]}
/>
```

---

## 11. FormOTP

One-time password input.

### Component

```tsx
// components/forms/form-otp.tsx
'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from '@/types/form'

interface FormOTPProps extends BaseFormFieldProps {
  length?: number
}

export function FormOTP({
  label,
  name,
  length = 6,
  description,
  error,
  required,
  disabled,
  className,
}: FormOTPProps) {
  const [otp, setOtp] = useState<string[]>(Array(length).fill(''))

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    // Auto-focus next input
    if (value && index < length - 1) {
      const nextInput = document.getElementById(`${name}-${index + 1}`)
      nextInput?.focus()
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <div className="flex gap-2">
        {otp.map((digit, index) => (
          <Input
            key={index}
            id={`${name}-${index}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            disabled={disabled}
            className={cn(
              'w-12 text-center',
              error && 'border-destructive'
            )}
          />
        ))}
      </div>

      {/* Hidden input */}
      <input type="hidden" name={name} value={otp.join('')} />

      {description && !error && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

### Usage

```tsx
<FormOTP
  label="Verification Code"
  name="otp"
  length={6}
  required
/>
```

---

## React Hook Form Integration

### Form Setup with Zod

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// Define schema
const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  price: z.number().positive('Price must be positive'),
  category_id: z.string().uuid(),
  is_published: z.boolean(),
})

type ProductFormValues = z.infer<typeof productSchema>

export function ProductForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
  })

  const onSubmit = async (data: ProductFormValues) => {
    // Handle form submission
    console.log(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <FormInput
        label="Product Name"
        {...register('name')}
        error={errors.name?.message}
      />

      <FormInput
        label="Price"
        type="number"
        {...register('price', { valueAsNumber: true })}
        error={errors.price?.message}
      />

      <FormSelect
        label="Category"
        {...register('category_id')}
        options={categories}
        error={errors.category_id?.message}
      />

      <FormCheckbox
        label="Published"
        {...register('is_published')}
      />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Product'}
      </Button>
    </form>
  )
}
```

---

## Server Action Integration

### Using with useActionState

```tsx
'use client'

import { useActionState } from 'react'
import { createProduct } from '@/app/actions/products'

export function ProductForm() {
  const [state, formAction] = useActionState(createProduct, {})

  return (
    <form action={formAction} className="space-y-6">
      <FormInput
        label="Product Name"
        name="name"
        error={state.errors?.name?.[0]}
      />

      <FormInput
        label="Price"
        name="price"
        type="number"
        error={state.errors?.price?.[0]}
      />

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Save Product'}
    </Button>
  )
}
```

---

## Best Practices

1. **Always validate**: Use Zod schemas for type-safe validation
2. **Show errors**: Display field-level errors clearly
3. **Loading states**: Disable form during submission
4. **Accessibility**: Include proper labels and ARIA attributes
5. **Required fields**: Mark with asterisk (*)
6. **Help text**: Provide descriptions for complex fields
7. **Auto-focus**: Focus first field or first error
8. **Keyboard navigation**: Ensure tab order is logical

---

## Dependencies

```json
{
  "dependencies": {
    "react-hook-form": "^7.50.0",
    "zod": "^4.0.0",
    "@hookform/resolvers": "^3.3.0",
    "@radix-ui/react-label": "^2.0.0",
    "@radix-ui/react-checkbox": "^1.0.0",
    "@radix-ui/react-radio-group": "^1.1.0",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-slider": "^1.1.0",
    "@radix-ui/react-switch": "^1.0.0",
    "date-fns": "^3.0.0",
    "lucide-react": "^0.400.0"
  }
}
```

---

**Version**: 3.0.0
**Updated**: January 2026
