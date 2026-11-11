import { describe, it, expect } from 'vitest';
import {
  derivePageTitle, derivePageCrumb, allNavigation, NAV_TITLE_LOOKUP,
  activeNavHref, activeNavFolder, NAV_FOLDERS,
} from './navigation';

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

  it('keeps the merged tracking pages named in the header', () => {
    expect(derivePageTitle('/tracking-devices')).toBe('Tracking Devices');
    expect(derivePageTitle('/gps-devices/abc/edit')).toBe('GPS Devices');
    expect(derivePageTitle('/driver-mobiles/new')).toBe('Tracking Mobiles');
  });
});

describe('attendance learner register crumb', () => {
  it('names the register page', () => {
    expect(derivePageCrumb('/attendance/learners').name).toBe('Learner Register');
    expect(derivePageCrumb('/attendance/coverage').name).toBe('Bus Coverage');
    expect(derivePageCrumb('/attendance').name).toBe('Daily Report');
  });

  it('names the folder, not the section, in the crumb', () => {
    expect(derivePageCrumb('/attendance/coverage').group).toBe('Attendance');
    expect(derivePageCrumb('/vehicles').group).toBe('Fleet');
    expect(derivePageCrumb('/dashboard').group).toBe('Overview');
  });
});

describe('activeNavHref', () => {
  // REGRESSION LOCK. /attendance is a prefix of its two siblings: a startsWith
  // check lights Daily Report on every attendance page.
  it('lights exactly one attendance page', () => {
    expect(activeNavHref('/attendance')).toBe('/attendance');
    expect(activeNavHref('/attendance/coverage')).toBe('/attendance/coverage');
    expect(activeNavHref('/attendance/learners')).toBe('/attendance/learners');
    expect(activeNavHref('/attendance/incharges')).toBe('/attendance/incharges');
  });

  it('keeps detail pages under their list', () => {
    expect(activeNavHref('/attendance/learners/abc-123')).toBe('/attendance/learners');
    expect(activeNavHref('/attendance/route-1/2026-11-11')).toBe('/attendance');
    expect(activeNavHref('/vehicles/abc/edit')).toBe('/vehicles');
    expect(activeNavHref('/fees/fine-rates')).toBe('/fees');
  });

  it('matches nothing for an unlisted path', () => {
    expect(activeNavHref('/some-other-page')).toBeNull();
    // A sibling-looking path must not match by string prefix alone.
    expect(activeNavHref('/attendance-windows')).toBeNull();
  });
});

describe('transport folders', () => {
  it('puts every transport page in a folder, and nothing else', () => {
    for (const item of allNavigation) {
      if (item.group === 'transport') expect(item.folder, item.name).toBeTruthy();
      else expect(item.folder, item.name).toBeUndefined();
    }
  });

  it('has no empty folder', () => {
    for (const f of NAV_FOLDERS) {
      expect(allNavigation.some((i) => i.folder === f.key), f.name).toBe(true);
    }
  });

  it('holds exactly the four attendance pages', () => {
    expect(allNavigation.filter((i) => i.folder === 'attendance').map((i) => i.name)).toEqual([
      'Daily Report', 'Bus Coverage', 'Learner Register', 'In-charge Marking',
    ]);
  });

  it('opens the folder of the current page', () => {
    expect(activeNavFolder('/attendance/learners/abc')).toBe('attendance');
    expect(activeNavFolder('/drivers')).toBe('fleet');
    expect(activeNavFolder('/track-all')).toBe('tracking');
    expect(activeNavFolder('/bookings')).toBe('routes');
    expect(activeNavFolder('/dashboard')).toBeNull();
  });

  it('has unique hrefs, so one path lights one link', () => {
    const hrefs = allNavigation.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
