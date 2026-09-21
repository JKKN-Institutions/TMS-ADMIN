/**
 * Bus sticker QR codes. The QR holds a URL `https://<tms>/i/<REG>` so a phone's
 * own camera app opens the inspection directly; the in-app scanner reads the
 * same string. The /i/<REG> shape is PRINTED on stickers — never change it.
 * Pure (no I/O): shared by the scanner, the sticker page and the API.
 */

/** Uppercase, strip everything that is not A–Z / 0–9. */
export function normalizeReg(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function stickerPath(reg: string): string {
  return `/i/${normalizeReg(reg)}`;
}

export function stickerUrl(origin: string, reg: string): string {
  return `${origin.replace(/\/+$/, '')}${stickerPath(reg)}`;
}

/**
 * Turn whatever the camera read into a normalised registration, or null when it
 * is not a bus sticker. Indian registrations always contain letters, which is
 * what separates them from a digits-only JKKN ID card.
 */
export function parseStickerScan(raw: string): string | null {
  const text = raw.replace(/[\r\n]+/g, '').trim();
  if (!text) return null;
  let candidate = text;
  if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
    const m = text.match(/\/i\/([^/?#\s]+)/i);
    if (!m) return null;
    try { candidate = decodeURIComponent(m[1]); } catch { candidate = m[1]; }
  }
  const code = normalizeReg(candidate);
  if (code.length < 6 || code.length > 12) return null;
  if (!/[A-Z]/.test(code) || !/[0-9]/.test(code)) return null;
  return code;
}
