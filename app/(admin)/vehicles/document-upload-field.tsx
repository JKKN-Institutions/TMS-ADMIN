'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload, X, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

// Uploads on selection to /api/admin/vehicles/documents and reports the stored
// storage PATH back to the form (value/onChange). Viewing resolves a signed URL.
export function DocumentUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string; // storage path ('' when none)
  onChange: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/vehicles/documents', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');
      onChange(json.path as string);
      toast.success(`${label} uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
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

  const fileName = value ? value.split('/').pop() : '';

  return (
    <div className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        {value ? (
          <>
            <button
              type="button"
              onClick={handleView}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText className="h-4 w-4 shrink-0 text-gray-500" />
              <span className="truncate max-w-[10rem]">{fileName}</span>
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-500"
              aria-label={`Remove ${label}`}
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-green-400 hover:text-green-600 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? 'Uploading…' : 'Upload (PDF/JPG/PNG)'}
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
