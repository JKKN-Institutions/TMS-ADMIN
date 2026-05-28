// Shared interface for all form components

export interface BaseFormFieldProps {
  label: string
  name: string
  description?: string
  error?: string
  required?: boolean
  disabled?: boolean
  className?: string
}
