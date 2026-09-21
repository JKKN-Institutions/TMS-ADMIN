/**
 * classifyCard — figures out what kind of value a Route Check scan produced:
 * the JKKN ID printed on the card front (QR), a raw UUID some older cards
 * still carry, or an id_code (Code 39 barcode: roll number / register number /
 * staff_id). Pure: no database, no React.
 */
import { classifyScan } from '@/lib/boarding/scan-resolve';

export type CardShape = 'jkkn_id' | 'uuid' | 'id_code' | 'unknown';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_CODE_RE = /^[A-Z0-9][A-Z0-9 .\-]{1,31}$/;

export function classifyCard(raw: string): { shape: CardShape; code: string } {
  // Strip CR/LF, then trim, then strip Code 39's start/stop '*' (which may
  // arrive with extra whitespace around it too), then trim again.
  let code = (raw ?? '').replace(/[\r\n]/g, '').trim();
  code = code.replace(/^[\s*]+/, '').replace(/[\s*]+$/, '').trim();

  // The JKKN ID QR — including the 7-bare-digit variant with the dash
  // dropped — is checked first so it never gets mis-read as an id_code.
  const scan = classifyScan(code, 'camera');
  if (scan.shape === 'jkkn_id') {
    return { shape: 'jkkn_id', code: scan.code };
  }

  if (UUID_RE.test(code)) {
    return { shape: 'uuid', code: code.toLowerCase() };
  }

  const idCandidate = code.toUpperCase().replace(/\s+/g, ' ').trim();
  if (ID_CODE_RE.test(idCandidate)) {
    return { shape: 'id_code', code: idCandidate };
  }

  return { shape: 'unknown', code };
}
