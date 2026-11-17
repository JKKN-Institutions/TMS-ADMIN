import { describe, it, expect } from 'vitest';
import { invalidRecipientEntries, parseRecipients, readMailConfig } from './config';

const full = {
  SMTP_USER: 'transport@jkkn.ac.in',
  SMTP_PASS: 'abcd efgh ijkl mnop',
  ATTENTION_DIGEST_RECIPIENTS: 'a@jkkn.ac.in, b@jkkn.ac.in',
  NEXT_PUBLIC_APP_URL: 'https://tms.example.in',
};

describe('parseRecipients', () => {
  it('parses, lower-cases and de-dupes', () => {
    expect(parseRecipients(' A@jkkn.ac.in, a@jkkn.ac.in ;b@jkkn.ac.in')).toEqual([
      'a@jkkn.ac.in',
      'b@jkkn.ac.in',
    ]);
  });

  it('drops anything that is not an address', () => {
    expect(parseRecipients('abc, ,x@, @y.in, ok@jkkn.ac.in')).toEqual(['ok@jkkn.ac.in']);
  });

  it('returns nothing for a missing value', () => {
    expect(parseRecipients(undefined)).toEqual([]);
    expect(parseRecipients('')).toEqual([]);
  });

  it('rejects an address carrying a header-injection newline', () => {
    expect(parseRecipients('a@jkkn.ac.in\nBcc: x@evil.in')).toEqual([]);
  });
});

describe('invalidRecipientEntries', () => {
  it('ignores blanks and a trailing newline', () => {
    expect(invalidRecipientEntries('a@jkkn.ac.in, ,b@jkkn.ac.in\n')).toEqual([]);
    expect(parseRecipients('a@jkkn.ac.in,b@jkkn.ac.in\n')).toEqual(['a@jkkn.ac.in', 'b@jkkn.ac.in']);
  });

  it('names every entry that is not a bare address', () => {
    expect(invalidRecipientEntries('Sekar <sekar.s@jkkn.ac.in>, ok@jkkn.ac.in, a@x.in b@x.in')).toEqual([
      'sekar <sekar.s@jkkn.ac.in>',
      'a@x.in b@x.in',
    ]);
  });
});

describe('readMailConfig', () => {
  it('refuses to send to only some recipients when one entry is malformed', () => {
    const cfg = readMailConfig({
      ...full,
      ATTENTION_DIGEST_RECIPIENTS: 'Sekar <sekar.s@jkkn.ac.in>, surendhar.m@jkkn.ac.in',
    });
    expect(cfg).toEqual({ ok: false, missing: ['ATTENTION_DIGEST_RECIPIENTS (invalid entry)'] });
  });

  it('rejects an app url with no scheme', () => {
    const cfg = readMailConfig({ ...full, NEXT_PUBLIC_APP_URL: 'tms.jkkn.ac.in' });
    expect(cfg).toEqual({ ok: false, missing: ['NEXT_PUBLIC_APP_URL (must start with http)'] });
  });

  it('reports every missing name', () => {
    expect(readMailConfig({})).toEqual({
      ok: false,
      missing: ['SMTP_USER', 'SMTP_PASS', 'ATTENTION_DIGEST_RECIPIENTS', 'NEXT_PUBLIC_APP_URL'],
    });
  });

  it('treats a recipients value with no valid address as missing', () => {
    const cfg = readMailConfig({ ...full, ATTENTION_DIGEST_RECIPIENTS: 'abc, ,x@' });
    expect(cfg).toEqual({ ok: false, missing: ['ATTENTION_DIGEST_RECIPIENTS'] });
  });

  it('treats blank values as missing', () => {
    const cfg = readMailConfig({ ...full, SMTP_PASS: '   ' });
    expect(cfg).toEqual({ ok: false, missing: ['SMTP_PASS'] });
  });

  it('reads a complete config and defaults the from name', () => {
    expect(readMailConfig(full)).toEqual({
      ok: true,
      user: 'transport@jkkn.ac.in',
      pass: 'abcd efgh ijkl mnop',
      fromName: 'JKKN Transport',
      recipients: ['a@jkkn.ac.in', 'b@jkkn.ac.in'],
      appUrl: 'https://tms.example.in',
    });
  });

  it('honours a custom from name', () => {
    const cfg = readMailConfig({ ...full, ATTENTION_DIGEST_FROM_NAME: 'JKKN Buses' });
    expect(cfg.ok && cfg.fromName).toBe('JKKN Buses');
  });
});
