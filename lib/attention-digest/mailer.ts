import nodemailer from 'nodemailer';
import type { MailConfig } from './config';

// The only place in TMS that sends email.
//
// Gmail SMTP with an app password, because the college is on Google Workspace:
// the mail leaves from a real @jkkn.ac.in mailbox, so it lands in the inbox
// rather than spam and costs nothing. The shared `email_notifications` table
// looks like a queue but nothing drains it (about 17,000 rows pending since May
// 2026) — do not "reuse" it.

export interface OutgoingMail {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export type SendMail = (
  cfg: Extract<MailConfig, { ok: true }>,
  msg: OutgoingMail
) => Promise<void>;

/** Sends one mail to every address in `to`. Throws on any SMTP error. */
export const sendMail: SendMail = async (cfg, msg) => {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    // A scheduled function must fail fast rather than hang until the platform
    // kills it, or the day's log row would be left stuck on 'sending'.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  await transport.sendMail({
    from: { name: cfg.fromName, address: cfg.user },
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
};
