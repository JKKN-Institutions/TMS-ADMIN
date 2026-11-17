import { describe, it, expect } from 'vitest';
import { parseDigestRequest } from './request';

const parse = (q: string) => parseDigestRequest(new URLSearchParams(q));

describe('parseDigestRequest', () => {
  it('no parameters is the real run', () => {
    expect(parse('')).toEqual({ ok: true, mode: 'run' });
  });

  it('dryRun=1 is a preview', () => {
    expect(parse('dryRun=1')).toEqual({ ok: true, mode: 'dryRun' });
  });

  it('testTo carries the address', () => {
    expect(parse('testTo=me@jkkn.ac.in')).toEqual({ ok: true, mode: 'test', testTo: 'me@jkkn.ac.in' });
  });

  // A mistyped preview flag must never fall through to mailing the heads.
  it.each(['dryRun=true', 'dryRun=0', 'dryrun=1', 'dry_run=1', 'testto=me@jkkn.ac.in', 'preview=1', 'testTo='])(
    'rejects %s instead of running for real',
    (q) => {
      expect(parse(q).ok).toBe(false);
    }
  );

  it('rejects dryRun combined with testTo', () => {
    expect(parse('dryRun=1&testTo=me@jkkn.ac.in').ok).toBe(false);
  });
});
