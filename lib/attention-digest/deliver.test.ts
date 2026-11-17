import { describe, it, expect, vi } from 'vitest';
import type { DashboardAlert } from '@/lib/dashboard/types';
import { decideDigest, deliverDigest, type DigestLog } from './deliver';
import type { MailConfig } from './config';

const okConfig: MailConfig = {
  ok: true,
  user: 'transport@jkkn.ac.in',
  pass: 'x',
  fromName: 'JKKN Transport',
  recipients: ['a@jkkn.ac.in', 'b@jkkn.ac.in'],
  appUrl: 'https://tms.example.in',
};

const alertRow = { id: 'overdue-bills', severity: 'critical', count: 3, subject: 'overdue transport bills',
  label: '3 overdue transport bills', state: 'Payment overdue', reason: 'r', href: '/fees' } as DashboardAlert;

/** In-memory stand-in for tms_attention_digest_log. */
function memoryLog(initial?: string): DigestLog & { outcome: () => string | undefined; error: () => string | null } {
  let outcome = initial;
  let error: string | null = null;
  return {
    outcome: () => outcome,
    error: () => error,
    async claim() {
      if (outcome === 'sent' || outcome === 'sending') return false;
      outcome = 'sending';
      return true;
    },
    async record(_date, o, detail) {
      outcome = o;
      error = detail.error ?? null;
    },
  };
}

describe('decideDigest', () => {
  it('skips an off day before looking at rows', () => {
    expect(decideDigest({ sunday: true, holiday: false, rows: 5 })).toBe('skipped_off_day');
    expect(decideDigest({ sunday: false, holiday: true, rows: 5 })).toBe('skipped_off_day');
  });

  it('skips when nothing is left', () => {
    expect(decideDigest({ sunday: false, holiday: false, rows: 0 })).toBe('skipped_clear');
  });

  it('sends otherwise', () => {
    expect(decideDigest({ sunday: false, holiday: false, rows: 1 })).toBe('send');
  });
});

describe('deliverDigest', () => {
  const base = { date: '2026-11-17', sunday: false, isHoliday: async () => false, config: okConfig };

  it('sends once to every recipient and records sent', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const log = memoryLog();
    const s = await deliverDigest({ ...base, alerts: [alertRow], log, send });
    expect(s.outcome).toBe('sent');
    expect(s.recipients).toEqual(['a@jkkn.ac.in', 'b@jkkn.ac.in']);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].to).toEqual(['a@jkkn.ac.in', 'b@jkkn.ac.in']);
    expect(send.mock.calls[0][1].subject).toBe('TMS – 1 item needs attention (17 Nov 2026)');
    expect(log.outcome()).toBe('sent');
  });

  it('does nothing on a second run the same day', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const log = memoryLog('sent');
    const s = await deliverDigest({ ...base, alerts: [alertRow], log, send });
    expect(s.outcome).toBe('skipped_already_sent');
    expect(send).not.toHaveBeenCalled();
    expect(log.outcome()).toBe('sent');
  });

  it('tries again after a failed run', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const log = memoryLog('failed');
    const s = await deliverDigest({ ...base, alerts: [alertRow], log, send });
    expect(s.outcome).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('records a skip and sends nothing when all is clear', async () => {
    const send = vi.fn();
    const log = memoryLog();
    const s = await deliverDigest({ ...base, alerts: [], log, send });
    expect(s.outcome).toBe('skipped_clear');
    expect(send).not.toHaveBeenCalled();
    expect(log.outcome()).toBe('skipped_clear');
  });

  it('records a skip on an off day even with rows', async () => {
    const send = vi.fn();
    const log = memoryLog();
    const s = await deliverDigest({ ...base, sunday: true, alerts: [alertRow], log, send });
    expect(s.outcome).toBe('skipped_off_day');
    expect(send).not.toHaveBeenCalled();
  });

  it('a skip never overwrites a mail already sent that day', async () => {
    const log = memoryLog('sent');
    const s = await deliverDigest({ ...base, alerts: [], log, send: vi.fn() });
    expect(s.outcome).toBe('skipped_already_sent');
    expect(log.outcome()).toBe('sent');
  });

  it('fails without sending when config is missing, naming what is missing', async () => {
    const send = vi.fn();
    const log = memoryLog();
    const s = await deliverDigest({
      ...base, alerts: [alertRow], log, send,
      config: { ok: false, missing: ['SMTP_USER', 'SMTP_PASS'] },
    });
    expect(s.outcome).toBe('failed');
    expect(s.error).toBe('missing: SMTP_USER, SMTP_PASS');
    expect(send).not.toHaveBeenCalled();
    expect(log.outcome()).toBe('failed');
    expect(log.error()).toBe('missing: SMTP_USER, SMTP_PASS');
  });

  it('skips on a declared holiday', async () => {
    const send = vi.fn();
    const log = memoryLog();
    const s = await deliverDigest({ ...base, isHoliday: async () => true, alerts: [alertRow], log, send });
    expect(s.outcome).toBe('skipped_off_day');
    expect(send).not.toHaveBeenCalled();
  });

  it('stands down while another run is mid-send', async () => {
    const send = vi.fn();
    const s = await deliverDigest({ ...base, alerts: [alertRow], log: memoryLog('sending'), send });
    expect(s.outcome).toBe('skipped_already_sent');
    expect(send).not.toHaveBeenCalled();
  });

  it('records a failed day when the holiday calendar cannot be read', async () => {
    const send = vi.fn();
    const log = memoryLog();
    const s = await deliverDigest({
      ...base, alerts: [alertRow], log, send,
      isHoliday: async () => { throw new Error('calendar down'); },
    });
    expect(s.outcome).toBe('failed');
    expect(s.error).toContain('calendar down');
    expect(send).not.toHaveBeenCalled();
    expect(log.outcome()).toBe('failed');
  });

  it('reports failed, without sending, when the log cannot be claimed', async () => {
    const send = vi.fn();
    const log: DigestLog = {
      claim: async () => { throw new Error('relation does not exist'); },
      record: async () => {},
    };
    const s = await deliverDigest({ ...base, alerts: [alertRow], log, send });
    expect(s.outcome).toBe('failed');
    expect(s.error).toContain('relation does not exist');
    expect(send).not.toHaveBeenCalled();
  });

  it('still reports sent when the mail went but the log update failed', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const log: DigestLog = {
      claim: async () => true,
      record: async () => { throw new Error('db gone'); },
    };
    const s = await deliverDigest({ ...base, alerts: [alertRow], log, send });
    expect(s.outcome).toBe('sent');
    expect(s.error).toContain('db gone');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('records an SMTP failure instead of throwing', async () => {
    const send = vi.fn().mockRejectedValue(new Error('535 bad credentials'));
    const log = memoryLog();
    const s = await deliverDigest({ ...base, alerts: [alertRow], log, send });
    expect(s.outcome).toBe('failed');
    expect(s.error).toContain('535 bad credentials');
    expect(log.outcome()).toBe('failed');
  });
});
