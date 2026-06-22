'use client';

import { useRef } from 'react';
import { Upload, X, FileText, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — mirrors the server limit
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);

// Deferred upload: a selected file is held by the parent form (pendingFile) and
// only POSTed to /api/admin/vehicles/documents on submit — nothing is written to
// storage until the vehicle is saved, so cancelling never orphans a blob.
// `value` is the already-saved storage path (edit mode), viewable via signed URL.
export function DocumentUploadField({
  label,
  value,
  pendingFile,
  onSelect,
  onClear,
}: {
  label: string;
  value: string; // existing storage path ('' when none)
  pendingFile: File | null; // chosen-but-not-yet-uploaded file
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Validate locally for instant feedback; the server re-validates on upload.
  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('File must be 10MB or smaller');
      return;
    }
    if (!ALLOWED.has(file.type)) {
      toast.error('Only PDF, JPG, or PNG files are allowed');
      return;
    }
    onSelect(file);
  };

  const handleView = async () => {
    if (!value) return;
    try {
      const res = await fetch(`/api/admin/vehicles/documents?path=${encodeURIComponent(value)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not open document');
      window.open(json.url as string, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open document');
    }
  };

  const existingName = value ? value.split('/').pop() : '';
  const removeBtn = (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-500"
      aria-label={`Remove ${label}`}
    >
      <X className="h-4 w-4" />
    </button>
  );

  return (
    <div className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        {pendingFile ? (
          // Newly selected — not yet uploaded; goes to storage on save.
          <>
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-700">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-[9rem]">{pendingFile.name}</span>
              <span className="shrink-0 text-xs text-amber-500">· uploads on save</span>
            </span>
            {removeBtn}
          </>
        ) : value ? (
          // Already saved (edit mode) — open via short-lived signed URL.
          <>
            <button
              type="button"
              onClick={handleView}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText className="h-4 w-4 shrink-0 text-gray-500" />
              <span className="truncate max-w-[10rem]">{existingName}</span>
            </button>
            {removeBtn}
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-green-400 hover:text-green-600"
          >
            <Upload className="h-4 w-4" />
            Choose file (PDF/JPG/PNG)
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={handleSelect}
        />
      </div>
    </div>
  );
}
