import type { DashboardAlert } from '@/lib/dashboard/types';
import type { MailConfig } from './config';
import type { SendMail } from './mailer';
import { renderDigest } from './render';

// The send/skip rules for the daily digest, with the database and the SMTP
// server passed in. Nothing here imports Supabase or nodemailer, so every rule
// — one mail a day, retry after a failure, never mail on an all-clear — is
// tested directly. run.ts supplies the real log table and the real mailer.

export type DigestOutcome =
  | 'sent'
  | 'failed'
  | 'skipped_clear'
  | 'skipped_off_day'
  | 'skipped_already_sent';

export type LoggedOutcome = Exclude<DigestOutcome, 'skipped_already_sent'>;

/** The day's row in tms_attention_digest_log, as the rules need it. */
export interface DigestLog {
  /**
   * Takes ownership of `date`. False when a mail for that date was already
   * sent or is being sent right now; true otherwise, including after an
   * earlier failure or skip — those may be retried.
   */
  claim(date: string): Promise<boolean>;
  record(
    date: string,
    outcome: LoggedOutcome,
    detail: { rows: number; recipients: string[]; error?: string | null }
  ): Promise<void>;
}

export interface DigestSummary {
  /** IST calendar date the run was for. */
  date: string;
  outcome: DigestOutcome | 'dry_run' | 'test_sent';
  /** Alert rows in (or that would be in) the mail. */
  rows: number;
  recipients: string[];
  error: string | null;
  /** Dry run only: exactly what would be sent. */
  preview?: { subject: string; html: string; text: string };
}

/**
 * Whether today's mail goes out. The off-day test comes first: on a Sunday or
 * a declared holiday nobody is at work to act, and "nobody scanned" would list
 * every route for no reason.
 */
export function decideDigest(i: {
  sunday: boolean;
  holiday: boolean;
  rows: number;
}): 'send' | 'skipped_off_day' | 'skipped_clear' {
  if (i.sunday || i.holiday) return 'skipped_off_day';
  if (i.rows === 0) return 'skipped_clear';
  return 'send';
}

/**
 * Applies the rules for one day and performs the send.
 *
 * Never throws for a send or config problem: those become a `failed` row with
 * the reason, so a broken mailbox is visible in the log and can be retried.
 * `alerts` must already be filtered by digestAlerts.
 */
export async function deliverDigest(i: {
  date: string;
  sunday: boolean;
  holiday: boolean;
  alerts: DashboardAlert[];
  config: MailConfig;
  log: DigestLog;
  send: SendMail;
}): Promise<DigestSummary> {
  const rows = i.alerts.length;
  const summary = (
    outcome: DigestSummary['outcome'],
    recipients: string[] = [],
    error: string | null = null
  ): DigestSummary => ({ date: i.date, outcome, rows, recipients, error });

  // Claimed before anything else, skips included, so a late second run can
  // never overwrite the record of a mail that already went out.
  if (!(await i.log.claim(i.date))) return summary('skipped_already_sent');

  const decision = decideDigest({ sunday: i.sunday, holiday: i.holiday, rows });
  if (decision !== 'send') {
    await i.log.record(i.date, decision, { rows, recipients: [] });
    return summary(decision);
  }

  if (!i.config.ok) {
    const error = `missing: ${i.config.missing.join(', ')}`;
    await i.log.record(i.date, 'failed', { rows, recipients: [], error });
    return summary('failed', [], error);
  }

  const recipients = i.config.recipients;
  const mail = renderDigest(i.alerts, { date: i.date, appUrl: i.config.appUrl });
  try {
    await i.send(i.config, { to: recipients, ...mail });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await i.log.record(i.date, 'failed', { rows, recipients, error });
    return summary('failed', recipients, error);
  }

  await i.log.record(i.date, 'sent', { rows, recipients });
  return summary('sent', recipients);
}
