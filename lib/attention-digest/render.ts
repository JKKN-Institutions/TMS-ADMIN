import type { AlertSeverity, DashboardAlert } from '@/lib/dashboard/types';

// Turns the dashboard's "Needs attention" rows into one mail.
//
// Pure on purpose: alerts in, strings out, no database and no clock. That is
// what lets the whole look of the mail be tested, and lets the cron route show
// a dry-run preview that is byte-for-byte what would be sent.

export interface DigestMail {
  subject: string;
  html: string;
  text: string;
}

/**
 * The rows that go in the mail: everything except severity 'info'.
 *
 * The one info row is "open grievances, none stale yet" — worth a glance on the
 * dashboard, not worth a daily mail. Leaving it out also means a day with only
 * info rows counts as nothing to report, so no mail is sent. The grey "could
 * not run" row stays: a check that failed is not a check that passed.
 */
export function digestAlerts(alerts: DashboardAlert[]): DashboardAlert[] {
  return alerts.filter((a) => a.severity !== 'info');
}

type MailSeverity = Exclude<AlertSeverity, 'info'>;

const GROUPS: Array<{ severity: MailSeverity; heading: string; color: string; tint: string }> = [
  { severity: 'critical', heading: 'Critical', color: '#b91c1c', tint: '#fef2f2' },
  { severity: 'warning', heading: 'Warning', color: '#b45309', tint: '#fffbeb' },
  { severity: 'unknown', heading: 'Could not check', color: '#475569', tint: '#f1f5f9' },
];

const FOOTER =
  'Sent automatically by JKKN TMS every working day at 10:00 am. Fixed items drop off the next mail.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-17' -> '17 Nov 2026'. Parsed by hand so no timezone can shift it. */
function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''} ${y}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Absolute link for an alert, or null when there is nowhere to go. */
function linkFor(alert: DashboardAlert, appUrl: string): string | null {
  if (!alert.href || !appUrl) return null;
  return `${appUrl.replace(/\/+$/, '')}${alert.href}`;
}

/**
 * Renders the mail. `alerts` must already be filtered by digestAlerts.
 * `date` is the IST calendar date the checks were run for.
 */
export function renderDigest(
  alerts: DashboardAlert[],
  opts: { date: string; appUrl: string }
): DigestMail {
  const day = longDate(opts.date);
  const n = alerts.length;
  const subject =
    n === 1
      ? `TMS – 1 item needs attention (${day})`
      : `TMS – ${n} items need attention (${day})`;

  const groups = GROUPS.map((g) => ({
    ...g,
    rows: alerts.filter((a) => a.severity === g.severity),
  })).filter((g) => g.rows.length > 0);

  // ── Plain text ──
  const lines: string[] = [`JKKN Transport – needs attention, ${day}`, ''];
  for (const g of groups) {
    lines.push(g.heading.toUpperCase());
    for (const a of g.rows) {
      lines.push(`* ${a.count} ${a.subject}`);
      lines.push(`  ${a.reason}`);
      if (a.items?.length) lines.push(`  ${a.itemsLabel ?? 'Affected'}: ${a.items.join(', ')}`);
      if (a.action) lines.push(`  What to do: ${a.action}`);
      const link = linkFor(a, opts.appUrl);
      if (link) lines.push(`  ${link}`);
      lines.push('');
    }
  }
  lines.push(FOOTER);
  const text = lines.join('\n');

  // ── HTML ──
  // Tables and inline styles only: Gmail drops <style> blocks and most layout
  // CSS, and this is read on a phone as often as on a desktop.
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const blocks = groups
    .map((g) => {
      const rows = g.rows
        .map((a) => {
          const link = linkFor(a, opts.appUrl);
          const items = a.items?.length
            ? `<div style="${font}font-size:13px;color:#334155;margin-top:6px;"><strong>${esc(
                a.itemsLabel ?? 'Affected'
              )}:</strong> ${a.items.map(esc).join(', ')}</div>`
            : '';
          const action = a.action
            ? `<div style="${font}font-size:13px;color:#0f172a;margin-top:6px;"><strong>What to do:</strong> ${esc(
                a.action
              )}</div>`
            : '';
          const open = link
            ? `<div style="margin-top:8px;"><a href="${esc(link)}" style="${font}font-size:13px;color:#15803d;font-weight:bold;text-decoration:underline;">Open in TMS</a></div>`
            : '';
          return `<tr><td style="padding:12px 14px;border-top:1px solid #e2e8f0;">
<div style="${font}font-size:15px;color:#0f172a;"><strong style="font-size:18px;color:${g.color};">${a.count}</strong> ${esc(
            a.subject
          )} <span style="font-size:11px;color:${g.color};background:${g.tint};padding:2px 6px;border-radius:9px;white-space:nowrap;">${esc(
            a.state
          )}</span></div>
<div style="${font}font-size:13px;color:#475569;margin-top:4px;">${esc(a.reason)}</div>${items}${action}${open}
</td></tr>`;
        })
        .join('\n');
      return `<tr><td style="padding:14px 14px 6px;${font}font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:${g.color};">${g.heading}</td></tr>
${rows}`;
    })
    .join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
<tr><td style="padding:16px 14px;background:#166534;border-radius:8px 8px 0 0;">
<div style="${font}font-size:17px;font-weight:bold;color:#ffffff;">JKKN Transport – needs attention</div>
<div style="${font}font-size:13px;color:#dcfce7;margin-top:2px;">${esc(day)}</div>
</td></tr>
${blocks}
<tr><td style="padding:14px;border-top:1px solid #e2e8f0;${font}font-size:11px;color:#64748b;">${FOOTER}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
