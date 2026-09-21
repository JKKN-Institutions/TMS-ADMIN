'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera } from 'lucide-react';
import { classifyCameraError, cameraErrorMessage, shouldTryOtherCameras, pickBackCamera, isFreshCapture } from '@/lib/boarding/camera-errors';
import { parseStickerScan } from '@/lib/inspections/sticker-code';

const READER_ID = 'bus-sticker-reader';
const PHOTO_READER_ID = 'bus-sticker-photo-reader';
const READER_OPTIONS = { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false };
const SCAN_CONFIG = {
  fps: 12,
  qrbox: (w: number, h: number) => { const s = Math.max(50, Math.floor(Math.min(w, h) * 0.75)); return { width: s, height: s }; },
};
const SHARP_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 }, height: { ideal: 720 },
  advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
};

export function BusScanner({
  onCode, paused, parse = parseStickerScan,
  rejectMessage = 'That QR is not a bus sticker. Scan the sticker inside the bus.',
  subject = 'bus sticker', photoMode = 'any',
}: {
  onCode: (code: string) => void;
  paused: boolean;
  /** Turns a raw QR read into the code to hand to `onCode`, or null to reject it. */
  parse?: (raw: string) => string | null;
  rejectMessage?: string;
  /** What is being scanned, for the camera/photo error wording ("bus sticker", "ID card"). */
  subject?: string;
  /**
   * 'fresh-only' accepts only a photo just taken with the camera (a saved or
   * downloaded picture of a public ID card is no proof the card is present).
   */
  photoMode?: 'any' | 'fresh-only';
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const genRef = useRef(0);
  const startingRef = useRef(false);
  const pausedRef = useRef(paused);
  const onCodeRef = useRef(onCode);
  const parseRef = useRef(parse);
  const rejectRef = useRef(rejectMessage);
  const [error, setError] = useState<string | null>(null);
  pausedRef.current = paused;
  onCodeRef.current = onCode;
  parseRef.current = parse;
  rejectRef.current = rejectMessage;

  function onRead(text: string) {
    if (pausedRef.current) return;
    const code = parseRef.current(text);
    if (!code) { setError(rejectRef.current); return; }
    setError(null);
    // Next decode frame (~80ms away) must not re-fire before the `paused` prop
    // catches up from the parent's state update; the parent resets this via a
    // re-render (to false on error, or it stays true once the page navigates).
    pausedRef.current = true;
    onCodeRef.current(code);
  }

  async function stop() {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) { try { await s.stop(); await s.clear(); } catch { /* ignore */ } }
  }

  async function start() {
    if (scannerRef.current || startingRef.current || !document.getElementById(READER_ID)) return;
    startingRef.current = true;
    const gen = genRef.current;
    try {
      const attempt = async (camera: string | MediaTrackConstraints, video?: MediaTrackConstraints): Promise<true | { err: unknown }> => {
        const s = new Html5Qrcode(READER_ID, READER_OPTIONS);
        try { await s.start(camera, video ? { ...SCAN_CONFIG, videoConstraints: video } : SCAN_CONFIG, onRead, () => {}); }
        catch (err) { try { s.clear(); } catch { /* ignore */ } return { err }; }
        if (genRef.current !== gen) { try { await s.stop(); await s.clear(); } catch { /* ignore */ } return true; }
        scannerRef.current = s;
        return true;
      };
      const sharp = await attempt({ facingMode: 'environment' }, { facingMode: 'environment', ...SHARP_VIDEO });
      if (sharp === true) return;
      let kind = classifyCameraError(sharp.err);
      if (shouldTryOtherCameras(kind) && genRef.current === gen) {
        const plain = await attempt({ facingMode: 'environment' });
        if (plain === true) return;
        kind = classifyCameraError(plain.err);
      }
      if (shouldTryOtherCameras(kind) && genRef.current === gen) {
        try {
          const cams = await Html5Qrcode.getCameras();
          const preferred = pickBackCamera(cams);
          const ids = preferred ? [preferred, ...cams.map((c) => c.id).filter((id) => id !== preferred)] : [];
          for (const id of ids) {
            if (genRef.current !== gen) return;
            const r = await attempt(id);
            if (r === true) return;
            kind = classifyCameraError(r.err);
          }
        } catch (err) { kind = classifyCameraError(err); }
      }
      if (genRef.current === gen) setError(cameraErrorMessage(kind).replace('ID card', subject));
    } finally {
      startingRef.current = false;
    }
  }

  useEffect(() => {
    genRef.current++;
    void start();
    return () => { genRef.current++; void stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const photoRef = useRef<HTMLInputElement>(null);
  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (photoMode === 'fresh-only' && !isFreshCapture(file, Date.now())) {
      setError('Take a new photo of the ID card with the camera. Saved or downloaded pictures are not accepted.');
      return;
    }
    await stop();
    const reader = new Html5Qrcode(PHOTO_READER_ID, READER_OPTIONS);
    try { onRead(await reader.scanFile(file, false)); }
    catch { setError(`Could not read the ${subject} in that photo. Fill the frame with the QR and avoid glare.`); }
    finally { try { reader.clear(); } catch { /* ignore */ } genRef.current++; void start(); }
  }

  return (
    <div className="space-y-3">
      <div id={READER_ID} className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black" />
      <div id={PHOTO_READER_ID} className="hidden" />
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
      <button type="button" onClick={() => photoRef.current?.click()}
        className="mx-auto flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
        <Camera className="h-4 w-4" /> Scan from photo
      </button>
    </div>
  );
}
