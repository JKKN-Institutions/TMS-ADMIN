# File Upload Patterns

React Dropzone with validation and preview.

## Overview

Production-ready file upload with:
- **Drag & drop**: Intuitive file selection
- **Validation**: File type and size checks
- **Preview**: Image/file previews
- **Progress**: Upload status tracking
- **Multiple files**: Batch uploads

---

## Installation

```bash
npm install react-dropzone
```

---

## File Uploader Component

```tsx
// components/file-upload/file-uploader.tsx
'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, FileIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FileUploaderProps {
  maxFiles?: number
  maxSize?: number // in bytes
  accept?: Record<string, string[]>
  onFilesChange?: (files: File[]) => void
}

export function FileUploader({
  maxFiles = 5,
  maxSize = 5 * 1024 * 1024, // 5MB
  accept = {
    'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
  },
  onFilesChange,
}: FileUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setError(null)

      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0]
        if (rejection.errors[0]?.code === 'file-too-large') {
          setError(`File too large. Max size: ${maxSize / 1024 / 1024}MB`)
        } else if (rejection.errors[0]?.code === 'file-invalid-type') {
          setError('Invalid file type')
        } else if (rejection.errors[0]?.code === 'too-many-files') {
          setError(`Too many files. Max: ${maxFiles}`)
        }
        return
      }

      const newFiles = [...files, ...acceptedFiles].slice(0, maxFiles)
      setFiles(newFiles)
      onFilesChange?.(newFiles)
    },
    [files, maxFiles, maxSize, onFilesChange]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    maxSize,
    accept,
  })

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index)
    setFiles(newFiles)
    onFilesChange?.(newFiles)
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/10'
            : 'border-muted-foreground/25 hover:border-primary/50',
          error && 'border-destructive'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        {isDragActive ? (
          <p className="text-sm text-muted-foreground">Drop files here...</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Drag & drop files here, or click to select
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Max {maxFiles} files, up to {maxSize / 1024 / 1024}MB each
            </p>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <FilePreview
              key={index}
              file={file}
              onRemove={() => removeFile(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface FilePreviewProps {
  file: File
  onRemove: () => void
}

function FilePreview({ file, onRemove }: FilePreviewProps) {
  const [preview, setPreview] = useState<string | null>(null)

  // Generate preview for images
  if (file.type.startsWith('image/') && !preview) {
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
      {preview ? (
        <img
          src={preview}
          alt={file.name}
          className="h-12 w-12 object-cover rounded"
        />
      ) : (
        <FileIcon className="h-12 w-12 text-muted-foreground" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {(file.size / 1024).toFixed(2)} KB
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="flex-shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
```

---

## Upload with Progress

```tsx
// components/file-upload/file-uploader-with-progress.tsx
'use client'

import { useState } from 'react'
import { FileUploader } from './file-uploader'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export function FileUploaderWithProgress() {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    try {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          setProgress(percentComplete)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          console.log('Upload successful')
          setFiles([])
          setProgress(100)
        }
      })

      xhr.open('POST', '/api/upload')
      xhr.send(formData)
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <FileUploader onFilesChange={setFiles} />

      {uploading && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-sm text-center text-muted-foreground">
            {progress.toFixed(0)}% uploaded
          </p>
        </div>
      )}

      {files.length > 0 && !uploading && (
        <Button onClick={handleUpload} className="w-full">
          Upload {files.length} file{files.length > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  )
}
```

---

## Server Action Upload

```tsx
// app/actions/upload.ts
'use server'

import { writeFile } from 'fs/promises'
import { join } from 'path'

export async function uploadFiles(formData: FormData) {
  const files = formData.getAll('files') as File[]

  for (const file of files) {
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Save to public/uploads
    const path = join(process.cwd(), 'public', 'uploads', file.name)
    await writeFile(path, buffer)
  }

  return { success: true, count: files.length }
}
```

---

## Usage Example

```tsx
// app/(dashboard)/dashboard/products/new/page.tsx
import { FileUploader } from '@/components/file-upload/file-uploader'

export default function NewProductPage() {
  return (
    <form>
      <FileUploader
        maxFiles={5}
        maxSize={10 * 1024 * 1024} // 10MB
        accept={{
          'image/*': ['.png', '.jpg', '.jpeg'],
        }}
      />

      <button type="submit">Create Product</button>
    </form>
  )
}
```

---

**Version**: 3.0.0
