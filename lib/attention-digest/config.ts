// Mail settings for the daily "Needs attention" digest, read from env.
//
// Recipients and credentials live in env rather than source: the addresses are
// people's mailboxes, and the password is a Google app password that must never
// reach git. Reading is a pure function of an env object so every missing-value
// case can be tested without touching process.env.

export type MailConfig =
  | {
      ok: true;
      /** Gmail address the mail is sent from; also the SMTP login. */
      user: string;
      /** Google app password for `user`. */
      pass: string;
      fromName: string;
      recipients: string[];
      /** Base URL of the deployed app, for the "Open in TMS" links. */
      appUrl: string;
    }
  | { ok: false; missing: string[] };

const DEFAULT_FROM_NAME = 'JKKN Transport';

/**
 * One address, nothing else. Deliberately strict about whitespace: an entry
 * containing a newline could smuggle an extra header (a Bcc) into the mail.
 */
const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** Splits on comma or semicolon; trims, lower-cases, de-dupes, drops invalid. */
export function parseRecipients(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(/[,;]/)) {
    const address = part.replace(/^[ \t]+|[ \t]+$/g, '').toLowerCase();
    if (ADDRESS.test(address) && !out.includes(address)) out.push(address);
  }
  return out;
}

export function readMailConfig(env: Record<string, string | undefined>): MailConfig {
  const user = (env.SMTP_USER ?? '').trim();
  const pass = (env.SMTP_PASS ?? '').trim();
  const recipients = parseRecipients(env.ATTENTION_DIGEST_RECIPIENTS);
  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? '').trim();

  const missing: string[] = [];
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (recipients.length === 0) missing.push('ATTENTION_DIGEST_RECIPIENTS');
  if (!appUrl) missing.push('NEXT_PUBLIC_APP_URL');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    user,
    pass,
    fromName: (env.ATTENTION_DIGEST_FROM_NAME ?? '').trim() || DEFAULT_FROM_NAME,
    recipients,
    appUrl,
  };
}
