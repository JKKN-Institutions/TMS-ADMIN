import { describe, it, expect } from 'vitest';
import {
  MAX_DRIVER_MOBILE_IMAGES,
  normalizeImagePaths,
  exceedsImageCap,
  removedPaths,
} from './images';

describe('normalizeImagePaths', () => {
  it('keeps a clean list in order', () => {
    expect(normalizeImagePaths(['2026/a.jpg', '2026/b.jpg'])).toEqual(['2026/a.jpg', '2026/b.jpg']);
  });

  it('returns an empty list for non-array input', () => {
    expect(normalizeImagePaths(undefined)).toEqual([]);
    expect(normalizeImagePaths(null)).toEqual([]);
    expect(normalizeImagePaths('2026/a.jpg')).toEqual([]);
  });

  it('trims, and drops empty or whitespace-only entries', () => {
    expect(normalizeImagePaths([' 2026/a.jpg ', '', '   '])).toEqual(['2026/a.jpg']);
  });

  it('drops non-string entries', () => {
    expect(normalizeImagePaths(['2026/a.jpg', 5, null, {}, '2026/b.jpg'])).toEqual([
      '2026/a.jpg',
      '2026/b.jpg',
    ]);
  });

  it('de-duplicates while preserving first-seen order', () => {
    expect(normalizeImagePaths(['b', 'a', 'b'])).toEqual(['b', 'a']);
  });

  it('does NOT truncate past the cap — the API must reject, not silently drop', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(normalizeImagePaths(six)).toHaveLength(6);
  });
});

describe('exceedsImageCap', () => {
  it('allows exactly the maximum', () => {
    expect(exceedsImageCap(['a', 'b', 'c', 'd', 'e'])).toBe(false);
    expect(MAX_DRIVER_MOBILE_IMAGES).toBe(5);
  });

  it('flags one over the maximum', () => {
    expect(exceedsImageCap(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(true);
  });

  it('allows an empty list', () => {
    expect(exceedsImageCap([])).toBe(false);
  });
});

describe('removedPaths', () => {
  it('returns paths dropped between before and after', () => {
    expect(removedPaths(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });

  it('returns nothing when nothing was removed', () => {
    expect(removedPaths(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('returns nothing when images were only ADDED', () => {
    expect(removedPaths(['a'], ['a', 'b'])).toEqual([]);
  });

  it('returns every path when all were removed', () => {
    expect(removedPaths(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('treats a re-added path as not removed regardless of position', () => {
    expect(removedPaths(['a', 'b'], ['b', 'a'])).toEqual([]);
  });
});
