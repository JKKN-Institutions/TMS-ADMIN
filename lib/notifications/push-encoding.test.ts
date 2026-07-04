import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from './push-encoding';

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url string to the right bytes', () => {
    // "hello" in base64url is "aGVsbG8"
    const out = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(out)).toEqual([104, 101, 108, 108, 111]);
  });

  it('handles url-safe chars (- and _) and missing padding', () => {
    // bytes [251, 255] → standard base64 "+/8=" → base64url "-_8"
    const out = urlBase64ToUint8Array('-_8');
    expect(Array.from(out)).toEqual([251, 255]);
  });

  it('returns a Uint8Array of the decoded length', () => {
    const out = urlBase64ToUint8Array('aGVsbG8');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(5);
  });
});
