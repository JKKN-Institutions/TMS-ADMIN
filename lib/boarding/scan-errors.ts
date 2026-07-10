/**
 * Human-readable message for a camera/scanner failure surfaced by
 * @yudiel/react-qr-scanner's onError (its IScannerError.kind). Every message
 * steers the user to the manual 6-digit fallback so a broken camera never
 * blocks boarding.
 */
export function cameraErrorMessage(kind: string | undefined): string {
  switch (kind) {
    case 'permission-denied':
      return 'Camera permission denied — allow camera access or use manual entry below.';
    case 'no-camera':
      return 'No camera found — use manual entry below.';
    case 'in-use':
      return 'Camera is in use by another app — close it or use manual entry below.';
    case 'insecure-context':
      return 'Camera needs a secure (HTTPS) connection — use manual entry below.';
    case 'unsupported':
      return "This browser can't access the camera — use manual entry below.";
    case 'overconstrained':
      return "Camera couldn't match the requested settings — use manual entry below.";
    default:
      return 'Could not start camera — use manual entry below.';
  }
}
