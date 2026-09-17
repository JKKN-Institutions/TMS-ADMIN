/**
 * Why the boarding scanner's live camera would not start, in words a staffer
 * can act on. Scan only mode hides P / A / B, so a camera that silently fails
 * leaves the staffer with no way to mark anyone. They need the real reason,
 * and a second way to scan (a photo of the card).
 *
 * html5-qrcode's start() rejects with a STRING such as
 * "Error getting userMedia, error = NotAllowedError: Permission denied",
 * or "Camera streaming not supported by the browser." Both forms are handled.
 */

export type CameraFailure = 'blocked' | 'busy' | 'no_camera' | 'constraints' | 'unsupported' | 'unknown';

export function classifyCameraError(err: unknown): CameraFailure {
  const e = err as { name?: unknown; message?: unknown } | null | undefined;
  const text = [typeof e?.name === 'string' ? e.name : '', typeof e?.message === 'string' ? e.message : '', typeof err === 'string' ? err : '']
    .join(' ');
  if (/NotAllowedError|PermissionDenied|Permission denied|SecurityError/i.test(text)) return 'blocked';
  if (/NotReadableError|TrackStartError|AbortError|Could not start video/i.test(text)) return 'busy';
  if (/NotFoundError|DevicesNotFound|Requested device not found/i.test(text)) return 'no_camera';
  if (/OverconstrainedError|ConstraintNotSatisfied/i.test(text)) return 'constraints';
  if (/not supported|mediaDevices/i.test(text)) return 'unsupported';
  return 'unknown';
}

const PHOTO_HINT = ' Or tap "Scan from photo" to take a picture of the ID card.';

export function cameraErrorMessage(kind: CameraFailure): string {
  switch (kind) {
    case 'blocked':
      return 'Camera is blocked for TMS. In Chrome: ⋮ → Settings → Site settings → Camera → tms.jkkn.ai → Allow, then reopen the scanner.' + PHOTO_HINT;
    case 'busy':
      return 'Camera is being used by another app. Close WhatsApp camera, video calls or the Camera app, then tap Start camera.' + PHOTO_HINT;
    case 'no_camera':
      return 'No camera was found on this phone.' + PHOTO_HINT;
    case 'constraints':
      return 'This phone’s camera could not be opened in scanning mode.' + PHOTO_HINT;
    case 'unsupported':
      return 'This browser cannot use the live camera. Open TMS in Chrome or the installed JKKN TMS app, not from a WhatsApp link.' + PHOTO_HINT;
    default:
      return 'Could not start the camera. Tap Start camera to try again.' + PHOTO_HINT;
  }
}

/** A blocked or unsupported camera fails the same way on every camera — do not retry. */
export function shouldTryOtherCameras(kind: CameraFailure): boolean {
  return kind !== 'blocked' && kind !== 'unsupported';
}

/** The rear camera reads cards; fall back to the last listed (usually rear on Android). */
export function pickBackCamera(cams: Array<{ id: string; label: string }>): string | null {
  if (!cams.length) return null;
  const back = cams.find((c) => /back|rear|environment/i.test(c.label));
  return (back ?? cams[cams.length - 1]).id;
}

/**
 * A photo scan must be a picture taken NOW. JKKN IDs are printed publicly and
 * downloadable as images, so an old gallery file is not evidence the card is
 * in the staffer's hand. The input uses capture="environment" (camera, not
 * gallery); this is the second check for browsers that ignore it.
 */
export const PHOTO_MAX_AGE_MS = 2 * 60_000;
const CLOCK_SLACK_MS = 60_000;

export function isFreshCapture(file: { lastModified: number }, now: number): boolean {
  const t = file.lastModified;
  if (!t || !Number.isFinite(t)) return false;
  return now - t <= PHOTO_MAX_AGE_MS && t - now <= CLOCK_SLACK_MS;
}
