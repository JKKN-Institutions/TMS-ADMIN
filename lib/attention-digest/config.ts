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
 * One bare address, nothing else. No whitespace anywhere inside: an entry
 * containing a newline could smuggle an extra header (a Bcc) into the mail.
 */
const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** Entries of a comma/semicolon list: trimmed, lower-cased, blanks removed. */
function entries(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,;]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

/** The valid addresses in a comma/semicolon list, de-duped. */
export function parseRecipients(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const address of entries(raw)) {
    if (ADDRESS.test(address) && !out.includes(address)) out.push(address);
  }
  return out;
}

/**
 * The entries that are NOT a bare address, e.g. `Sekar <sekar@...>` or two
 * addresses separated by a space. Any of these makes the whole setting
 * invalid: quietly mailing "the ones that parsed" would leave one head out
 * with nothing to show for it but a shorter recipients column.
 */
export function invalidRecipientEntries(raw: string | undefined): string[] {
  return entries(raw).filter((entry) => !ADDRESS.test(entry));
}

export function readMailConfig(env: Record<string, string | undefined>): MailConfig {
  const user = (env.SMTP_USER ?? '').trim();
  const pass = (env.SMTP_PASS ?? '').trim();
  const recipients = parseRecipients(env.ATTENTION_DIGEST_RECIPIENTS);
  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? '').trim();

  const missing: string[] = [];
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (recipients.length === 0) {
    missing.push('ATTENTION_DIGEST_RECIPIENTS');
  } else if (invalidRecipientEntries(env.ATTENTION_DIGEST_RECIPIENTS).length > 0) {
    missing.push('ATTENTION_DIGEST_RECIPIENTS (invalid entry)');
  }
  if (!appUrl) {
    missing.push('NEXT_PUBLIC_APP_URL');
  } else if (!/^https?:\/\//i.test(appUrl)) {
    // Without a scheme the "Open in TMS" links are relative, and Gmail drops them.
    missing.push('NEXT_PUBLIC_APP_URL (must start with http)');
  }
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
