'use client';

import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import type { InspectionItemDTO } from '@/lib/inspections/types';
import type { ItemResult } from '@/lib/inspections/result';
import { uploadPhoto } from '@/app/(admin)/inspections/inspection-api';

type Patch = Partial<Pick<InspectionItemDTO, 'result' | 'note'>>;
const CATEGORY_TITLE: Record<string, string> = {
  documents: 'Documents', safety: 'Safety', mechanical: 'Mechanical', body_interior: 'Body & interior', driver: 'Driver',
};
const BTN: Record<ItemResult, [string, string]> = {
  pass: ['Pass', 'bg-green-600 text-white'], fail: ['Fail', 'bg-red-600 text-white'], na: ['N/A', 'bg-gray-600 text-white'],
};

function ItemRow({ item, onChange, onAddPhoto, onRemovePhoto, disabled }: {
  item: InspectionItemDTO;
  onChange: (p: Patch) => void;
  // Append/remove a single photo against whatever the CURRENT item state is
  // (applied by the parent via a functional setState update), instead of the
  // row sending a whole photoPaths/photoUrls array it captured before an
  // async upload — that array can go stale while `uploadPhoto` is in flight.
  onAddPhoto: (path: string, url: string) => void;
  onRemovePhoto: (index: number) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (disabled || !file || item.photoPaths.length >= 3) return;
    setUploading(true); setErr(null);
    try {
      const path = await uploadPhoto(file);
      onAddPhoto(path, URL.createObjectURL(file));
    } catch (x) { setErr((x as Error).message + ' — tap the camera to retry'); }
    finally { setUploading(false); }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium">
          {item.label}{item.severity === 'critical' && <span className="ml-1.5 rounded bg-red-100 px-1 text-[10px] font-bold uppercase text-red-700 dark:bg-red-900/40 dark:text-red-300">critical</span>}
        </p>
        <div className="flex gap-1">
          {(Object.keys(BTN) as ItemResult[]).map((r) => (
            <button key={r} type="button" disabled={disabled} onClick={() => onChange({ result: r })}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${item.result === r ? BTN[r][1] : 'border border-gray-300 dark:border-gray-700'}`}>
              {BTN[r][0]}
            </button>
          ))}
        </div>
      </div>
      {item.result === 'fail' && (
        <div className="space-y-2 rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
          <textarea value={item.note ?? ''} onChange={(e) => onChange({ note: e.target.value })} rows={2} disabled={disabled}
            placeholder="What is wrong? (required)" className="w-full rounded-md border border-red-200 p-2 text-sm disabled:opacity-50 dark:border-red-900 dark:bg-gray-900" />
          <div className="flex flex-wrap items-center gap-2">
            {item.photoUrls.map((u, i) => (
              <div key={item.photoPaths[i]} className="relative">
                {u ? <img src={u} alt="" className="h-16 w-16 rounded object-cover" /> : <div className="h-16 w-16 rounded bg-gray-200 dark:bg-gray-800" />}
                <button type="button" aria-label="Remove photo" disabled={disabled} className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white disabled:opacity-50"
                  onClick={() => onRemovePhoto(i)}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {item.photoPaths.length < 3 && (
              <button type="button" disabled={uploading || disabled} onClick={() => fileRef.current?.click()}
                className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-gray-400 text-gray-500 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400">
                {uploading ? '…' : <Camera className="h-5 w-5" />}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={onFile} />
          </div>
          {err && <p className="text-xs text-red-700 dark:text-red-400">{err}</p>}
        </div>
      )}
    </li>
  );
}

export function ChecklistStep({ items, onChange, onAddPhoto, onRemovePhoto, onMarkRemainingPass, disabled }: {
  items: InspectionItemDTO[];
  onChange: (id: string, patch: Patch) => void;
  onAddPhoto: (id: string, path: string, url: string) => void;
  onRemovePhoto: (id: string, index: number) => void;
  onMarkRemainingPass: () => void;
  disabled?: boolean;
}) {
  const groups = items.reduce<Record<string, InspectionItemDTO[]>>((acc, i) => { (acc[i.category] ??= []).push(i); return acc; }, {});
  const answered = items.filter((i) => i.result).length;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">{answered} / {items.length} answered</p>
        <button type="button" disabled={disabled} onClick={onMarkRemainingPass} className="text-sm font-medium text-green-700 hover:underline disabled:opacity-50 dark:text-green-400">Mark remaining as Pass</button>
      </div>
      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat} className="rounded-xl border border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="pt-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{CATEGORY_TITLE[cat] ?? cat}</h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {list.map((i) => (
              <ItemRow
                key={i.id}
                item={i}
                onChange={(p) => onChange(i.id, p)}
                onAddPhoto={(path, url) => onAddPhoto(i.id, path, url)}
                onRemovePhoto={(index) => onRemovePhoto(i.id, index)}
                disabled={disabled}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
