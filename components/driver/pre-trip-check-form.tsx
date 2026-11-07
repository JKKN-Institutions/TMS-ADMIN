'use client';

import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, ClipboardCheck, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PHOTO_TOO_BIG_MESSAGE,
  PRE_TRIP_ITEMS,
  PRE_TRIP_UPLOAD_MAX_BYTES,
  type PreTripItemKey,
} from '@/lib/tracking/pre-trip-check';

export interface SavedPreTripCheck {
  id: string;
  any_issue: boolean;
  /** How many people the NOT OK alert reached; null when no alert was needed or sent. */
  alerted: number | null;
}

/**
 * Re-encode the camera photo as a JPEG with its longest side at most `maxSide`.
 * Phone cameras produce 3–8 MB files; Vercel refuses request bodies over ~4.5 MB.
 * Returns null if the browser cannot decode the photo at all.
 */
async function encodeJpeg(file: File, maxSide: number, quality: number): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ? new File([blob], 'odometer.jpg', { type: 'image/jpeg' }) : null;
  } catch {
    return null;
  }
}

/**
 * The photo to upload: ~1600 px JPEG, then a smaller one if that is somehow still
 * too big. If the phone cannot re-encode it, the original is used only when it is
 * already under the upload limit; otherwise null (the screen asks for a retake).
 */
async function shrinkPhoto(file: File): Promise<File | null> {
  for (const [side, quality] of [
    [1600, 0.8],
    [1200, 0.7],
  ] as const) {
    const out = await encodeJpeg(file, side, quality);
    if (out && out.size <= PRE_TRIP_UPLOAD_MAX_BYTES) return out;
  }
  return file.size <= PRE_TRIP_UPLOAD_MAX_BYTES ? file : null;
}

/**
 * The driver's daily pre-trip check: six one-tap yes/no items, the odometer reading
 * and a photo of the odometer. Built for a phone held in one hand — every target is
 * thumb-sized.
 */
export function PreTripCheckForm({
  routeId,
  routeLabel,
  onSaved,
}: {
  routeId: string;
  routeLabel: string;
  onSaved: (check: SavedPreTripCheck) => void;
}) {
  const [answers, setAnswers] = useState<Partial<Record<PreTripItemKey, boolean>>>({});
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const answered = PRE_TRIP_ITEMS.filter(({ key }) => answers[key] !== undefined).length;
  const anyNo = PRE_TRIP_ITEMS.some(({ key }) => answers[key] === false);
  const ready = answered === PRE_TRIP_ITEMS.length && odometer.trim() !== '' && !!photo;

  const submit = async () => {
    if (!ready || !photo) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('routeId', routeId);
      for (const { key } of PRE_TRIP_ITEMS) fd.set(key, answers[key] ? 'yes' : 'no');
      fd.set('odometer_km', odometer.trim());
      if (notes.trim()) fd.set('notes', notes.trim());
      const upload = await shrinkPhoto(photo);
      if (!upload) {
        setError(PHOTO_TOO_BIG_MESSAGE);
        return;
      }
      fd.set('photo', upload);

      const res = await fetch('/api/driver/pre-trip-check', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      const j = (await res.json().catch(() => null)) as
        | { error?: string; data?: { check: { id: string; any_issue: boolean } | null; alerted: number | null } }
        | null;
      // 413 = the platform refused the body before our route ran (no JSON error).
      if (res.status === 413) {
        setError(PHOTO_TOO_BIG_MESSAGE);
        return;
      }
      if (!res.ok || !j?.data?.check) {
        setError(j?.error ?? 'Could not save the check. Please try again.');
        return;
      }
      onSaved({ id: j.data.check.id, any_issue: j.data.check.any_issue, alerted: j.data.alerted ?? null });
    } catch {
      setError('Network problem. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-amber-700 dark:text-amber-300" />
        <div>
          <p className="text-base font-semibold text-gray-900 dark:text-white">Pre-trip check — once a day</p>
          <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
            Check the bus for {routeLabel} before your first trip today. Tap OK or NOT OK for each item.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {PRE_TRIP_ITEMS.map(({ key, label }) => {
          const v = answers[key];
          return (
            <li key={key} className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
              <p className="mb-2 text-base font-medium text-gray-900 dark:text-white">{label}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={v === true}
                  onClick={() => setAnswers((a) => ({ ...a, [key]: true }))}
                  className={cn(
                    'inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 text-base font-semibold transition-colors',
                    v === true
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                  )}
                >
                  <CheckCircle2 className="h-5 w-5" /> OK
                </button>
                <button
                  type="button"
                  aria-pressed={v === false}
                  onClick={() => setAnswers((a) => ({ ...a, [key]: false }))}
                  className={cn(
                    'inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 text-base font-semibold transition-colors',
                    v === false
                      ? 'border-red-600 bg-red-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                  )}
                >
                  <XCircle className="h-5 w-5" /> NOT OK
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <label className="block">
        <span className="mb-1 block text-base font-medium text-gray-900 dark:text-white">Odometer reading (km)</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.1"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          placeholder="e.g. 124530"
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-lg tabular-nums text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </label>

      <div>
        <span className="mb-1 block text-base font-medium text-gray-900 dark:text-white">Photo of the odometer</span>
        <label
          className={cn(
            'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-base font-semibold',
            photo
              ? 'border-green-500 text-green-700 dark:text-green-300'
              : 'border-gray-400 text-gray-700 dark:border-gray-600 dark:text-gray-200'
          )}
        >
          <Camera className="h-5 w-5" />
          {photo ? 'Retake photo' : 'Take photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              setPhoto(e.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </label>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimisable asset
          <img src={preview} alt="Odometer photo preview" className="mt-2 max-h-48 w-full rounded-lg object-contain" />
        )}
      </div>

      {anyNo && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-900 dark:text-white">
            What is wrong? (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <span className="mt-1 block text-sm text-amber-800 dark:text-amber-300">
            The transport head will be told about every NOT OK item.
          </span>
        </label>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        disabled={!ready || saving}
        onClick={() => void submit()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 px-6 py-5 text-lg font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <ClipboardCheck className="h-5 w-5" />
        {saving
          ? 'Saving…'
          : ready
            ? error
              ? 'TRY AGAIN'
              : 'SAVE CHECK'
            : answered < PRE_TRIP_ITEMS.length
              ? `Answer all items (${answered}/${PRE_TRIP_ITEMS.length})`
              : odometer.trim() === ''
                ? 'Enter the odometer reading'
                : 'Take the odometer photo'}
      </button>
    </div>
  );
}
