import { describe, it, expect } from 'vitest';
import { derivePageTitle, allNavigation, NAV_TITLE_LOOKUP } from './navigation';

describe('derivePageTitle', () => {
  it('names the maintenance fee module at /fees', () => {
    expect(derivePageTitle('/fees')).toBe('Maintenance Fee');
    expect(derivePageTitle('/fees/new')).toBe('Maintenance Fee');
  });

  // REGRESSION LOCK. /fees/fine-rates is the TRANSPORT FEE (the charge raised
  // when the maintenance fee goes unpaid). Without its own nav entry the longest
  // matching href is /fees, so the header read "Maintenance Fee" on the transport
  // fee screen — the two charges are exactly what this rename must keep apart.
  it('names the transport fee module at /fees/fine-rates', () => {
    expect(derivePageTitle('/fees/fine-rates')).toBe('Transport Fee');
  });

  it('falls back to a title-cased first segment for an unlisted path', () => {
    expect(derivePageTitle('/some-other-page')).toBe('Some Other Page');
    expect(derivePageTitle('/')).toBe('Dashboard');
  });

  it('exposes sub-items in the title lookup', () => {
    const fees = allNavigation.find((i) => i.href === '/fees');
    expect(fees?.subItems?.map((s) => s.href)).toContain('/fees/fine-rates');
    expect(NAV_TITLE_LOOKUP.some((i) => i.href === '/fees/fine-rates')).toBe(true);
  });
});
