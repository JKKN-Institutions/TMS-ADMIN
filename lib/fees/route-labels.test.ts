import { describe, it, expect } from 'vitest';
import { routeLabel, routeFilterOptions } from './route-labels';

describe('routeLabel', () => {
  it('reads as number then name', () => {
    expect(routeLabel('32', 'SANKAGIRI RS')).toBe('32 — SANKAGIRI RS');
  });

  it('falls back to the number alone when the route has no name', () => {
    expect(routeLabel('32', null)).toBe('32');
  });

  it('falls back to the name alone when the route has no number', () => {
    expect(routeLabel(null, 'SANKAGIRI RS')).toBe('SANKAGIRI RS');
  });

  it('is empty when neither is known', () => {
    expect(routeLabel(null, null)).toBe('');
  });
});

describe('routeFilterOptions', () => {
  const row = (route_number: string | null, route_name: string | null = null) => ({
    route_number,
    route_name,
  });

  it('offers one option per route, labelled number then name', () => {
    expect(routeFilterOptions([row('32', 'SANKAGIRI RS')])).toEqual([
      { label: '32 — SANKAGIRI RS', value: '32' },
    ]);
  });

  it('de-duplicates the many bills that share a route', () => {
    const opts = routeFilterOptions([row('32', 'A'), row('32', 'A'), row('32', 'A')]);
    expect(opts).toHaveLength(1);
  });

  it('sorts numerically, so route 9 comes before route 10', () => {
    const opts = routeFilterOptions([row('10'), row('9'), row('32'), row('2')]);
    expect(opts.map((o) => o.value)).toEqual(['2', '9', '10', '32']);
  });

  it('keeps non-numeric route codes, sorted after the numbered ones', () => {
    const opts = routeFilterOptions([row('10'), row('CITY'), row('2')]);
    expect(opts.map((o) => o.value)).toEqual(['2', '10', 'CITY']);
  });

  it('excludes people with no route rather than offering a blank option', () => {
    expect(routeFilterOptions([row(null), row(null, 'ignored')])).toEqual([]);
  });

  it('ignores a blank or whitespace route number', () => {
    expect(routeFilterOptions([row(''), row('   '), row('7', 'SEVEN')])).toEqual([
      { label: '7 — SEVEN', value: '7' },
    ]);
  });
});
