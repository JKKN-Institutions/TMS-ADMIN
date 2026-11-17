import { describe, it, expect } from 'vitest';
import { buildAlerts, type AlertInputs } from '@/lib/dashboard/alerts';
import { digestAlerts, renderDigest } from './render';

const clean: AlertInputs = {
  overdueBills: 0,
  staleGrievances: 0,
  openGrievances: 0,
  ridersWithoutStop: 0,
  expiredVehicleDocs: 0,
  routesWithoutDriver: 0,
  routesWithoutBus: 0,
  routesNobodyScanned: 0,
};

const opts = { date: '2026-11-17', appUrl: 'https://tms.example.in' };
const render = (input: Partial<AlertInputs>, o = opts) =>
  renderDigest(digestAlerts(buildAlerts({ ...clean, ...input })), o);

describe('digestAlerts', () => {
  it('drops info rows', () => {
    expect(digestAlerts(buildAlerts({ ...clean, openGrievances: 5 }))).toEqual([]);
  });

  it('keeps the rest in order', () => {
    const rows = digestAlerts(
      buildAlerts({ ...clean, openGrievances: 5, staleGrievances: 3, overdueBills: 172 })
    );
    expect(rows.map((r) => r.id)).toEqual(['overdue-bills', 'stale-grievances']);
  });

  it('keeps the could-not-run row', () => {
    const rows = digestAlerts(buildAlerts({ ...clean, overdueBills: null }));
    expect(rows.map((r) => r.id)).toEqual(['checks-unmeasured']);
  });
});

describe('renderDigest', () => {
  it('subject counts rows and carries the date', () => {
    const { subject } = render({ overdueBills: 172, ridersWithoutStop: 9 });
    expect(subject).toBe('TMS – 2 items need attention (17 Nov 2026)');
  });

  it('uses the singular for one row', () => {
    expect(render({ overdueBills: 172 }).subject).toBe('TMS – 1 item needs attention (17 Nov 2026)');
  });

  it('groups rows under Critical, Warning and Could not check, in that order', () => {
    const { text } = render({ overdueBills: 172, ridersWithoutStop: 9, staleGrievances: null });
    const c = text.indexOf('CRITICAL');
    const w = text.indexOf('WARNING');
    const u = text.indexOf('COULD NOT CHECK');
    expect(c).toBeGreaterThanOrEqual(0);
    expect(w).toBeGreaterThan(c);
    expect(u).toBeGreaterThan(w);
  });

  it('omits a heading that has no rows', () => {
    const { text, html } = render({ overdueBills: 172 });
    expect(text).not.toContain('WARNING');
    expect(html).not.toContain('Warning');
  });

  it('shows count, subject, reason and action for a row', () => {
    const { text, html } = render({ overdueBills: 172 });
    for (const body of [text, html]) {
      expect(body).toContain('172');
      expect(body).toContain('overdue transport bills');
      expect(body).toContain('The due date has passed');
      expect(body).toContain('Send a payment reminder');
    }
  });

  it('lists every affected item, not a truncated sample', () => {
    const regs = Array.from({ length: 14 }, (_, i) => `TN 33 X ${1000 + i}`);
    const { text, html } = render({
      expiredVehicleDocs: 14,
      expiredVehicleDocsRegistrations: regs,
    });
    for (const r of regs) {
      expect(text).toContain(r);
      expect(html).toContain(r);
    }
  });

  it('makes links absolute and tolerates a trailing slash', () => {
    const { text, html } = render({ overdueBills: 1 }, { ...opts, appUrl: 'https://x.in/' });
    expect(html).toContain('href="https://x.in/fees"');
    expect(text).toContain('https://x.in/fees');
    expect(html).not.toContain('x.in//fees');
  });

  it('omits the link for a row with no href', () => {
    const { html, text } = render({ overdueBills: null });
    expect(html).not.toContain('Open in TMS');
    expect(text).not.toContain('https://');
  });

  it('omits links entirely when no app url is known', () => {
    const { html } = render({ overdueBills: 1 }, { ...opts, appUrl: '' });
    expect(html).not.toContain('href=');
  });

  it('escapes database text in html', () => {
    const { html } = render({
      routesWithoutBus: 1,
      routesWithoutBusNumbers: ['<b>&"x'],
    });
    expect(html).toContain('&lt;b&gt;&amp;&quot;x');
    expect(html).not.toContain('<b>&"x');
  });

  it('text body has no html tags', () => {
    const { text } = render({ overdueBills: 172, routesWithoutBus: 2, routesWithoutBusNumbers: ['4', '9'] });
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('carries the footer in both bodies', () => {
    const { text, html } = render({ overdueBills: 1 });
    const footer = 'Fixed items drop off the next mail.';
    expect(text).toContain(footer);
    expect(html).toContain(footer);
  });
});
