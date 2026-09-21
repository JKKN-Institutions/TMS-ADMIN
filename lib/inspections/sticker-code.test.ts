import { describe, it, expect } from 'vitest';
import { normalizeReg, stickerPath, stickerUrl, parseStickerScan } from './sticker-code';

describe('normalizeReg', () => {
  it('uppercases and strips spaces, dashes and dots', () => {
    expect(normalizeReg(' tn 34-ab.1234 ')).toBe('TN34AB1234');
  });
});

describe('stickerPath / stickerUrl', () => {
  it('builds the permanent /i/<REG> path', () => {
    expect(stickerPath('TN 34 AB 1234')).toBe('/i/TN34AB1234');
  });
  it('joins origin without a double slash', () => {
    expect(stickerUrl('https://tms.jkkn.ai/', 'TN 34 AB 1234')).toBe('https://tms.jkkn.ai/i/TN34AB1234');
  });
});

describe('parseStickerScan', () => {
  it('reads the code out of a full sticker URL', () => {
    expect(parseStickerScan('https://tms.jkkn.ai/i/TN34AB1234')).toBe('TN34AB1234');
  });
  it('reads a URL with query string and trailing newline', () => {
    expect(parseStickerScan('https://tms.jkkn.ai/i/tn34ab1234?x=1\r\n')).toBe('TN34AB1234');
  });
  it('accepts a bare registration (typed or old sticker)', () => {
    expect(parseStickerScan('TN 34 AB 1234')).toBe('TN34AB1234');
  });
  it('rejects a JKKN ID card (digits only)', () => {
    expect(parseStickerScan('348295-7')).toBeNull();
  });
  it('rejects empty and junk', () => {
    expect(parseStickerScan('   ')).toBeNull();
    expect(parseStickerScan('https://example.com/some/page')).toBeNull();
  });
});
