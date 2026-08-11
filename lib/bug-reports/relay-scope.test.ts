import { describe, it, expect } from 'vitest';
import { scopeRelaySearchToReporter } from './relay-scope';

describe('scopeRelaySearchToReporter', () => {
  it('adds reporter_email when the caller sent none', () => {
    const r = scopeRelaySearchToReporter('?limit=20', 'Aicse@jkkn.ac.in');
    expect(r.ok).toBe(true);
    expect(r.ok && new URLSearchParams(r.search).get('reporter_email')).toBe('aicse@jkkn.ac.in');
  });

  it('preserves the caller’s other query params', () => {
    const r = scopeRelaySearchToReporter('?page=2&limit=20&status=open', 'a@b.c');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = new URLSearchParams(r.search);
    expect(q.get('page')).toBe('2');
    expect(q.get('limit')).toBe('20');
    expect(q.get('status')).toBe('open');
  });

  it('OVERWRITES a caller-supplied reporter_email so nobody can read another user’s reports', () => {
    const r = scopeRelaySearchToReporter('?reporter_email=victim@jkkn.ac.in', 'attacker@jkkn.ac.in');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = new URLSearchParams(r.search);
    expect(q.getAll('reporter_email')).toEqual(['attacker@jkkn.ac.in']);
  });

  it('drops repeated reporter_email params rather than appending to them', () => {
    const r = scopeRelaySearchToReporter('?reporter_email=a@x.com&reporter_email=b@x.com', 'me@x.com');
    expect(r.ok).toBe(true);
    expect(r.ok && new URLSearchParams(r.search).getAll('reporter_email')).toEqual(['me@x.com']);
  });

  it('works with an empty search string', () => {
    const r = scopeRelaySearchToReporter('', 'me@x.com');
    expect(r.ok).toBe(true);
    expect(r.ok && r.search).toBe('?reporter_email=me%40x.com');
  });

  it('fails closed when there is no authenticated identity', () => {
    expect(scopeRelaySearchToReporter('?limit=5', null)).toEqual({ ok: false, reason: 'no_identity' });
    expect(scopeRelaySearchToReporter('?limit=5', '   ')).toEqual({ ok: false, reason: 'no_identity' });
  });

  it('returns a search string that starts with ? so it can be appended to a URL', () => {
    const r = scopeRelaySearchToReporter('?limit=5', 'me@x.com');
    expect(r.ok && r.search.startsWith('?')).toBe(true);
  });
});
