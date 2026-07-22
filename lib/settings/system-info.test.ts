import { describe, it, expect } from 'vitest';
import { classifyLatency, formatCount } from './system-info';

describe('classifyLatency', () => {
  it('classifies a fast round-trip as good', () => {
    expect(classifyLatency(0)).toBe('good');
    expect(classifyLatency(199)).toBe('good');
  });
  it('classifies a sluggish round-trip as slow', () => {
    expect(classifyLatency(200)).toBe('slow');
    expect(classifyLatency(999)).toBe('slow');
  });
  it('classifies a very slow round-trip as critical', () => {
    expect(classifyLatency(1000)).toBe('critical');
    expect(classifyLatency(5000)).toBe('critical');
  });
  it('treats a negative reading as good rather than throwing', () => {
    expect(classifyLatency(-1)).toBe('good');
  });
});

describe('formatCount', () => {
  it('renders a measured count as its own string, including zero', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(42)).toBe('42');
  });
  it('renders null (a failed measurement) as an em dash, never "0"', () => {
    expect(formatCount(null)).toBe('—');
  });
});
