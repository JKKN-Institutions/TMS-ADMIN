import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAlerts } from '@/lib/dashboard/alerts';
import { loadAttentionCounts, toAlertInputs } from '@/lib/dashboard/attention';
import { loadRouteBoard } from '@/lib/routes/board';
import { istToday, isSunday } from '@/lib/booking/window';
import { loadExceptions } from '@/lib/booking/calendar';
import { parseRecipients, readMailConfig } from './config';
import { deliverDigest, type DigestLog, type DigestSummary } from './deliver';
import { sendMail, type SendMail } from './mailer';
import { digestAlerts, renderDigest } from './render';

// Daily "Needs attention" mail to the transport heads: the wiring.
//
// Gathers the same alert rows the admin dashboard shows, then hands them to
// deliverDigest (deliver.ts), which owns the send/skip rules. Called from
// /api/cron/attention-digest at 10:00 IST — after the morning boarding burst,
// because "booked but nobody scanned" means nothing before the buses have run.

const LOG_TABLE = 'tms_attention_digest_log';

/** The real log table. One row per IST date; the primary key is the guard. */
function supabaseLog(svc: SupabaseClient): DigestLog {
  return {
    async claim(date) {
      const insert = await svc.from(LOG_TABLE).insert({ digest_date: date, outcome: 'sending' });
      if (!insert.error) return true;
      if ((insert.error as { code?: string }).code !== '23505') throw insert.error;

      // A row for today exists. Sent, or mid-send by a concurrent run: stand
      // down. Failed or skipped earlier today: take it over — but only if it
      // still holds the outcome just read, so two retries cannot both win.
      const existing = await svc.from(LOG_TABLE).select('outcome').eq('digest_date', date).single();
      if (existing.error) throw existing.error;
      const was = (existing.data as { outcome: string }).outcome;
      if (was === 'sent' || was === 'sending') return false;

      const taken = await svc
        .from(LOG_TABLE)
        .update({ outcome: 'sending', error: null, updated_at: new Date().toISOString() })
        .eq('digest_date', date)
        .eq('outcome', was)
        .select('digest_date');
      if (taken.error) throw taken.error;
      return (taken.data ?? []).length > 0;
    },

    async record(date, outcome, detail) {
      const { error } = await svc
        .from(LOG_TABLE)
        .update({
          outcome,
          rows: detail.rows,
          recipients: detail.recipients,
          error: detail.error ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('digest_date', date);
      if (error) throw error;
    },
  };
}

/**
 * Runs the digest for today (IST).
 *
 * - `dryRun`: returns exactly what would be sent. Sends nothing, writes
 *   nothing, and works on an off day or before any mail settings exist.
 * - `testTo`: sends today's mail to that one address only, and leaves the
 *   day's log untouched so the real send still happens.
 * - otherwise: the real run, at most one mail per IST date.
 */
export async function runAttentionDigest(
  svc: SupabaseClient,
  opts: { dryRun?: boolean; testTo?: string; send?: SendMail; now?: Date } = {}
): Promise<DigestSummary> {
  const date = istToday(opts.now ?? new Date());
  const config = readMailConfig(process.env);

  const [counts, board] = await Promise.all([loadAttentionCounts(svc, date), loadRouteBoard(date)]);
  const alerts = digestAlerts(buildAlerts(toAlertInputs(counts, board)));
  const rows = alerts.length;

  if (opts.dryRun) {
    const appUrl = config.ok ? config.appUrl : (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
    return {
      date,
      outcome: 'dry_run',
      rows,
      recipients: config.ok ? config.recipients : [],
      error: config.ok ? null : `missing: ${config.missing.join(', ')}`,
      preview: renderDigest(alerts, { date, appUrl }),
    };
  }

  if (opts.testTo !== undefined) {
    const to = parseRecipients(opts.testTo);
    if (to.length !== 1) {
      return { date, outcome: 'failed', rows, recipients: [], error: 'testTo must be one email address' };
    }
    if (!config.ok) {
      return { date, outcome: 'failed', rows, recipients: [], error: `missing: ${config.missing.join(', ')}` };
    }
    try {
      const mail = renderDigest(alerts, { date, appUrl: config.appUrl });
      await (opts.send ?? sendMail)(config, { to, ...mail, subject: `[TEST] ${mail.subject}` });
      return { date, outcome: 'test_sent', rows, recipients: to, error: null };
    } catch (e) {
      return { date, outcome: 'failed', rows, recipients: to, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return deliverDigest({
    date,
    sunday: isSunday(date),
    // All-routes exceptions only (route_id null): a holiday declared for a
    // single route does not make it a day off for the transport office.
    isHoliday: async () => (await loadExceptions(svc, null, date, date)).has(date),
    alerts,
    config,
    log: supabaseLog(svc),
    send: opts.send ?? sendMail,
  });
}
