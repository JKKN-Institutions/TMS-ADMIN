// lib/boarding/marking-mode.test.ts
import { describe, it, expect } from 'vitest';
import { allowedMethods, parseMarkingMode, isMarkingMode, MARKING_MODES } from './marking-mode';

describe('parseMarkingMode', () => {
  it('reads a stored mode', () => {
    expect(parseMarkingMode({ markingMode: 'scan_only' })).toBe('scan_only');
    expect(parseMarkingMode({ markingMode: 'manual_only' })).toBe('manual_only');
  });
  it('falls back to both for missing or unknown values', () => {
    expect(parseMarkingMode(null)).toBe('both');
    expect(parseMarkingMode({})).toBe('both');
    expect(parseMarkingMode({ markingMode: 'SCAN' })).toBe('both');
  });
  it('knows exactly the three modes', () => {
    expect([...MARKING_MODES].sort()).toEqual(['both', 'manual_only', 'scan_only']);
    expect(isMarkingMode('both')).toBe(true);
    expect(isMarkingMode('auto')).toBe(false);
  });
});

describe('allowedMethods', () => {
  it('limits ordinary staff to the chosen method', () => {
    expect(allowedMethods('scan_only', false)).toEqual({ manual: false, scan: true });
    expect(allowedMethods('manual_only', false)).toEqual({ manual: true, scan: false });
    expect(allowedMethods('both', false)).toEqual({ manual: true, scan: true });
  });
  it('never limits the transport office', () => {
    for (const m of MARKING_MODES) expect(allowedMethods(m, true)).toEqual({ manual: true, scan: true });
  });
});
