import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Upload, X } from 'lucide-react'
import { useState } from 'react'
import type { BaseFormFieldProps } from './base-form-field-props'

interface FormFileUploadProps extends BaseFormFieldProps {
  accept?: string
  multiple?: boolean
  maxSize?: number // in MB
  maxFiles?: number
}

export function FormFileUpload({
  label,
  name,
  accept,
  multiple = false,
  maxSize = 10,
  maxFiles = 5,
  description,
  error,
  required,
  disabled,
  className,
}: FormFileUploadProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploadError, setUploadError] = useState<string>('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    setUploadError('')

    // Validate file size
    const invalidFiles = selectedFiles.filter((file) => file.size > maxSize * 1024 * 1024)
    if (invalidFiles.length > 0) {
      setUploadError(`Files must be smaller than ${maxSize}MB`)
      return
    }

    // Validate file count
    if (multiple && files.length + selectedFiles.length > maxFiles) {
      setUploadError(`Maximum ${maxFiles} files allowed`)
      return
    }

    setFiles(multiple ? [...files, ...selectedFiles] : selectedFiles)
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
          'hover:border-primary/50',
          error && 'border-destructive',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <Upload className="h-10 w-10 text-muted-foreground mb-4" />
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Drag and drop files here, or click to select
          </p>
          <input
            id={name}
            name={name}
            type="file"
            accept={accept}
            multiple={multiple}
            required={required && files.length === 0}
            disabled={disabled}
            className="hidden"
            onChange={handleFileChange}
            aria-invalid={!!(error || uploadError)}
            aria-describedby={
              error || uploadError
                ? `${name}-error`
                : description
                ? `${name}-description`
                : undefined
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => document.getElementById(name)?.click()}
          >
            Select Files
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {accept && `Accepted: ${accept} • `}
          Max size: {maxSize}MB
          {multiple && ` • Max files: ${maxFiles}`}
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => removeFile(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {description && !error && !uploadError && (
        <p id={`${name}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}

      {(error || uploadError) && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error || uploadError}
        </p>
      )}
    </div>
  )
}
