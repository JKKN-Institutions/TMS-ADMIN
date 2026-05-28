# Form Component Templates

Standardized form components with React Hook Form + Zod validation.

## Components Included

1. **FormInput** - Text, email, password, number inputs
2. **FormSelect** - Dropdown select
3. **FormCheckbox** - Single checkbox
4. **FormRadioGroup** - Radio button group
5. **FormDatePicker** - Date selection
6. **FormTextarea** - Multi-line text
7. **FormSlider** - Range slider
8. **FormSwitch** - Toggle switch
9. **FormFileUpload** - File upload with drag & drop
10. **FormCheckboxGroup** - Multiple checkboxes
11. **FormOTP** - One-time password input
12. **BaseFormFieldProps** - Shared interface

## Installation

1. Copy templates to `components/forms/`

2. Install dependencies:
   ```bash
   npm install react-hook-form zod @hookform/resolvers
   npx shadcn@latest add input label select checkbox textarea slider switch
   ```

## Usage with Server Actions

```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createProduct } from '@/app/actions/products'
import { FormInput } from '@/components/forms/form-input'
import { FormSelect } from '@/components/forms/form-select'
import { Button } from '@/components/ui/button'

export function ProductForm({ categories }) {
  const [state, formAction] = useActionState(createProduct, {})

  return (
    <form action={formAction} className="space-y-6">
      <FormInput
        label="Product Name"
        name="name"
        required
        error={state.errors?.name?.[0]}
      />

      <FormInput
        label="Price"
        name="price"
        type="number"
        step="0.01"
        prefix="$"
        error={state.errors?.price?.[0]}
      />

      <FormSelect
        label="Category"
        name="category_id"
        options={categories.map(cat => ({
          value: cat.id,
          label: cat.name
        }))}
        error={state.errors?.category_id?.[0]}
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

## Usage with React Hook Form

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormInput } from '@/components/forms/form-input'

const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  price: z.number().positive('Price must be positive'),
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
    // Handle submission
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

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save'}
      </Button>
    </form>
  )
}
```

## Creating Additional Form Components

All form components follow the same pattern. Here's the template:

```tsx
import { Label } from '@/components/ui/label'
import { ShadcnComponent } from '@/components/ui/component'
import { cn } from '@/lib/utils'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormComponentProps extends BaseFormFieldProps {
  // Component-specific props
}

export function FormComponent({
  label,
  name,
  description,
  error,
  required,
  disabled,
  className,
  // Component-specific props
}: FormComponentProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <ShadcnComponent
        id={name}
        name={name}
        required={required}
        disabled={disabled}
        className={cn(error && 'border-destructive')}
        aria-invalid={!!error}
      />

      {description && !error && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

## Form Component Examples

### FormSelect

```tsx
<FormSelect
  label="Category"
  name="category_id"
  options={[
    { value: '1', label: 'Electronics' },
    { value: '2', label: 'Clothing' },
  ]}
  placeholder="Select category"
  error={state.errors?.category_id?.[0]}
/>
```

### FormTextarea

```tsx
<FormTextarea
  label="Description"
  name="description"
  rows={6}
  maxLength={500}
  placeholder="Enter product description..."
  error={state.errors?.description?.[0]}
/>
```

### FormCheckbox

```tsx
<FormCheckbox
  label="I agree to the terms and conditions"
  name="agree_terms"
  required
/>
```

### FormDatePicker

```tsx
<FormDatePicker
  label="Start Date"
  name="start_date"
  minDate={new Date()}
  required
  error={state.errors?.start_date?.[0]}
/>
```

### FormFileUpload

```tsx
<FormFileUpload
  label="Product Images"
  name="images"
  accept="image/*"
  maxSize={10} // MB
  multiple
  error={state.errors?.images?.[0]}
/>
```

## Best Practices

1. **Consistent Interface**: All components extend `BaseFormFieldProps`
2. **Accessibility**: Include proper labels and ARIA attributes
3. **Validation**: Show field-level errors clearly
4. **Loading States**: Disable during form submission
5. **Required Fields**: Mark with asterisk (*)
6. **Help Text**: Provide descriptions for complex fields

## Customization

### Add Custom Styling

```tsx
<FormInput
  label="Email"
  name="email"
  className="max-w-md" // Custom container class
/>
```

### Add Icons

```tsx
import { Mail } from 'lucide-react'

<FormInput
  label="Email"
  name="email"
  prefix={<Mail className="h-4 w-4" />}
/>
```

### Add Character Counter

```tsx
<FormTextarea
  label="Description"
  name="description"
  maxLength={500}
  showCounter // Add this prop to component
/>
```

## Dependencies

- React Hook Form (optional, for client-side validation)
- Zod (for schema validation)
- Shadcn UI components
- Lucide React icons

## See Also

- [Form Patterns Documentation](../../modules/01-frontend/form-patterns.md)
- [Server Actions Forms](../../references/server-actions-forms.md)
- [Backend Module Pattern 4](../../modules/02-backend/patterns/pattern-04-form-validation.md)
